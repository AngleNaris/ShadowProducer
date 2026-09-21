import { createHash } from "node:crypto"
import { open, readFile } from "node:fs/promises"

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListPartsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { AppError, type AssetStorage } from "@shadowproducer/application"

const uploadLifetimeSeconds = 15 * 60
const downloadLifetimeSeconds = 5 * 60

export class S3AssetStorage implements AssetStorage {
  private ready: Promise<void> | null = null

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly browserOrigins: string[],
  ) {}

  ensureReady() {
    this.ready ??= this.ensureBucket()
    return this.ready
  }

  createMultipartUpload({
    objectKey,
    mimeType,
  }: {
    objectKey: string
    mimeType: string
  }) {
    return this.withReady(async () => {
      const result = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: objectKey,
          ContentType: mimeType,
        }),
      )
      if (!result.UploadId) {
        throw new AppError("ASSET_STORAGE_FAILED", "对象存储未创建上传会话", 502)
      }
      return { uploadId: result.UploadId }
    })
  }

  listMultipartParts(input: { objectKey: string; uploadId: string }) {
    return this.withReady(async () => {
      const parts: Array<{ partNumber: number; etag: string; sizeBytes: number }> = []
      let marker: string | undefined
      do {
        const page = await this.client.send(
          new ListPartsCommand({
            Bucket: this.bucket,
            Key: input.objectKey,
            UploadId: input.uploadId,
            PartNumberMarker: marker,
          }),
        )
        for (const part of page.Parts ?? []) {
          if (!part.PartNumber || !part.ETag || !part.Size) continue
          parts.push({
            partNumber: part.PartNumber,
            etag: part.ETag,
            sizeBytes: part.Size,
          })
        }
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined
      } while (marker)
      return parts.sort((left, right) => left.partNumber - right.partNumber)
    })
  }

  createMultipartPartUploads(input: {
    objectKey: string
    uploadId: string
    partNumbers: number[]
  }) {
    return this.withReady(() =>
      Promise.all(
        input.partNumbers.map(async (partNumber) => ({
          partNumber,
          method: "PUT" as const,
          url: await getSignedUrl(
            this.client,
            new UploadPartCommand({
              Bucket: this.bucket,
              Key: input.objectKey,
              UploadId: input.uploadId,
              PartNumber: partNumber,
            }),
            { expiresIn: uploadLifetimeSeconds },
          ),
          headers: {},
          expiresAt: new Date(Date.now() + uploadLifetimeSeconds * 1000).toISOString(),
        })),
      ),
    )
  }

  completeMultipartUpload(input: {
    objectKey: string
    uploadId: string
    partSizeBytes: number
    totalParts: number
    sizeBytes: number
    mimeType: string
  }) {
    return this.withReady(async () => {
      const completedChecksum = await this.hashCompletedObject(input)
      if (completedChecksum) return completedChecksum

      const parts = await this.listMultipartParts(input)
      this.assertCompleteParts(parts, input)
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: input.objectKey,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
          },
        }),
      )
      const checksum = await this.hashCompletedObject(input)
      if (!checksum) {
        throw new AppError("ASSET_STORAGE_FAILED", "对象存储未完成文件合并", 502)
      }
      return checksum
    })
  }

  abortMultipartUpload(input: { objectKey: string; uploadId: string }) {
    return this.withReady(async () => {
      try {
        await this.client.send(
          new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: input.objectKey,
            UploadId: input.uploadId,
          }),
        )
      } catch (error) {
        if (!isMissingObject(error)) throw error
      }
    })
  }

  createDownloadUrl(
    objectKey: string,
    options?: { attachment?: boolean; expiresInSeconds?: number },
  ) {
    return this.withReady(() =>
      getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          ResponseContentDisposition: options?.attachment ? "attachment" : undefined,
        }),
        { expiresIn: options?.expiresInSeconds ?? downloadLifetimeSeconds },
      ),
    )
  }

  downloadObjectToFile(objectKey: string, targetPath: string) {
    return this.withReady(async () => {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      )
      if (!response.Body) {
        throw new AppError("ASSET_STORAGE_FAILED", "对象存储未返回文件内容", 502)
      }
      const file = await open(targetPath, "wx")
      try {
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          await file.write(chunk)
        }
      } finally {
        await file.close()
      }
    })
  }

  readTextObject(objectKey: string) {
    return this.withReady(async () => {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      )
      if (!result.Body) throw new AppError("ASSET_STORAGE_FAILED", "播放清单不存在", 502)
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength
          if (size > 1024 * 1024) throw new Error("HLS playlist exceeds 1 MiB")
          chunks.push(chunk)
        }
      } finally {
        const stream = result.Body as { destroy?: () => void }
        stream.destroy?.()
      }
      return Buffer.concat(chunks).toString("utf8")
    })
  }

  uploadDerivedFile(objectKey: string, sourcePath: string, mimeType: string) {
    return this.withReady(async () => {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: await readFile(sourcePath),
          ContentType: mimeType,
        }),
      )
    })
  }

  deleteObject(objectKey: string) {
    return this.withReady(async () => {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      )
    })
  }

  private withReady<T>(operation: () => Promise<T>) {
    return this.ensureReady().then(operation)
  }

  private assertCompleteParts(
    parts: Array<{ partNumber: number; etag: string; sizeBytes: number }>,
    input: { partSizeBytes: number; totalParts: number; sizeBytes: number },
  ) {
    if (parts.length !== input.totalParts) {
      throw new AppError(
        "ASSET_UPLOAD_INCOMPLETE",
        `文件仍有 ${input.totalParts - parts.length} 个分片未上传`,
        409,
      )
    }
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const expectedPartNumber = index + 1
      const expectedSize =
        expectedPartNumber === input.totalParts
          ? input.sizeBytes - input.partSizeBytes * (input.totalParts - 1)
          : input.partSizeBytes
      if (part.partNumber !== expectedPartNumber || part.sizeBytes !== expectedSize) {
        throw new AppError(
          "ASSET_PART_MISMATCH",
          `第 ${expectedPartNumber} 个分片与上传任务不一致`,
          409,
        )
      }
    }
  }

  private async hashCompletedObject(input: {
    objectKey: string
    sizeBytes: number
    mimeType: string
  }) {
    let object: HeadObjectCommandOutput
    try {
      object = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: input.objectKey }),
      )
    } catch (error) {
      if (isMissingObject(error)) return null
      throw error
    }
    if (object.ContentLength !== input.sizeBytes) {
      throw new AppError(
        "ASSET_SIZE_MISMATCH",
        "已上传文件大小与创建上传任务时不一致",
        409,
      )
    }
    if (object.ContentType && object.ContentType !== input.mimeType) {
      throw new AppError(
        "ASSET_TYPE_MISMATCH",
        "已上传文件类型与创建上传任务时不一致",
        409,
      )
    }
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: input.objectKey }),
    )
    if (!response.Body) {
      throw new AppError("ASSET_STORAGE_FAILED", "对象存储未返回文件内容", 502)
    }
    const hash = createHash("sha256")
    let receivedBytes = 0
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      receivedBytes += chunk.byteLength
    }
    if (receivedBytes !== input.sizeBytes) {
      throw new AppError("ASSET_SIZE_MISMATCH", "服务端读取的文件大小不完整", 409)
    }
    return hash.digest("hex")
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
    }
    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ["*"],
                AllowedMethods: ["GET", "HEAD", "PUT"],
                AllowedOrigins: this.browserOrigins,
                ExposeHeaders: ["etag"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      )
    } catch (error) {
      if (!isBucketCorsUnsupported(error)) throw error
    }
  }
}

function isMissingObject(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (("name" in error &&
      (error.name === "NotFound" ||
        error.name === "NoSuchKey" ||
        error.name === "NoSuchUpload")) ||
      ("$metadata" in error &&
        typeof error.$metadata === "object" &&
        error.$metadata !== null &&
        "httpStatusCode" in error.$metadata &&
        error.$metadata.httpStatusCode === 404))
  )
}

function isBucketCorsUnsupported(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotImplemented"
  )
}

export function createS3AssetStorage() {
  const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:9100"
  const region = process.env.S3_REGION ?? "us-east-1"
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? "shadowproducer"
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "shadowproducer-dev-secret"
  const bucket = process.env.S3_ASSET_BUCKET ?? "shadowproducer-assets"
  const browserOrigins = (
    process.env.S3_BROWSER_ORIGINS ?? "http://127.0.0.1:3211,http://localhost:3211"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  return new S3AssetStorage(client, bucket, browserOrigins)
}
