ALTER TABLE breakdown_items
  ADD COLUMN IF NOT EXISTS requirement_type text NOT NULL DEFAULT '未标注',
  ADD COLUMN IF NOT EXISTS quantity text NOT NULL DEFAULT '未标注',
  ADD COLUMN IF NOT EXISTS preparation text NOT NULL DEFAULT '未标注',
  ADD COLUMN IF NOT EXISTS agent_assessment text NOT NULL DEFAULT '未标注',
  ADD COLUMN IF NOT EXISTS source_document text NOT NULL DEFAULT '未标注',
  ADD COLUMN IF NOT EXISTS source_version text NOT NULL DEFAULT '未标注',
  ADD COLUMN IF NOT EXISTS source_location text NOT NULL DEFAULT '未标注';

UPDATE breakdown_items
SET
  requirement_type = CASE category
    WHEN 'cast' THEN '演员与角色'
    WHEN 'location' THEN '拍摄场地'
    WHEN 'art' THEN '美术与道具'
    WHEN 'wardrobe' THEN '服化造型'
    WHEN 'equipment' THEN '摄制设备'
    WHEN 'special' THEN '特殊执行与保障'
    ELSE '未标注'
  END,
  preparation = CASE
    WHEN length(trim(specification)) > 0 THEN specification
    ELSE '未标注'
  END,
  source_document = COALESCE(
    NULLIF(regexp_replace(split_part(source, ' · ', 1), '\s+v[^[:space:]]+$', ''), ''),
    '未标注'
  ),
  source_version = COALESCE(
    NULLIF(substring(split_part(source, ' · ', 1) from '(v[^[:space:]]+)$'), ''),
    '未标注'
  ),
  source_location = COALESCE(NULLIF(split_part(source, ' · ', 2), ''), '未标注')
WHERE
  requirement_type = '未标注'
  OR preparation = '未标注'
  OR source_document = '未标注'
  OR source_version = '未标注'
  OR source_location = '未标注';

ALTER TABLE breakdown_items
  DROP CONSTRAINT IF EXISTS breakdown_items_state_check;

ALTER TABLE breakdown_items
  ADD CONSTRAINT breakdown_items_state_check CHECK (
    state IN (
      '待确认',
      '待安排',
      '待采购或租赁',
      '已联系',
      '已确认',
      '已完成',
      '不需要',
      '已取消'
    )
  );
