-- Stop old media workers before applying. Originals and old derivatives remain intact.
WITH candidates AS (
  SELECT media.asset_id FROM asset_media AS media
  JOIN team_assets AS asset ON asset.id = media.asset_id
  LEFT JOIN media_processing_jobs AS job ON job.asset_id = asset.id
  WHERE asset.status = 'ready' AND asset.archived_at IS NULL
    AND asset.object_key IS NOT NULL AND asset.kind IN ('视频', '音频')
    AND media.status = 'ready'
    AND COALESCE(media.review_proxy_object_key, '') NOT LIKE '%/preview-v2.hls/%/master.m3u8'
    AND (job.status = 'succeeded' OR job.asset_id IS NULL)
), queued AS (
  INSERT INTO media_processing_jobs (asset_id, status)
  SELECT asset_id, 'pending' FROM candidates
  ON CONFLICT (asset_id) DO UPDATE SET
    status = 'pending', attempts = 0, available_at = now(), locked_by = NULL,
    lease_expires_at = NULL, last_error = NULL, completed_at = NULL, updated_at = now()
  RETURNING asset_id
)
UPDATE asset_media SET status = 'pending', error_message = NULL, updated_at = now()
WHERE asset_id IN (SELECT asset_id FROM queued);
