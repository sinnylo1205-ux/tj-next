-- 1. 新增 line_user_id 欄位到 user_log_in 表
ALTER TABLE user_log_in 
ADD COLUMN IF NOT EXISTS line_user_id TEXT UNIQUE;

-- 建立索引以便快速查詢
CREATE INDEX IF NOT EXISTS idx_user_log_in_line_user_id ON user_log_in(line_user_id);

-- 2. 建立 system_events 表（用於追蹤通知事件）
CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  sent_to_n8n BOOLEAN DEFAULT false,
  n8n_response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

-- RLS 政策：Admin 可讀取
CREATE POLICY "Admins can read system_events"
ON system_events FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- RLS 政策：Service role 可完整操作
CREATE POLICY "Service role can manage system_events"
ON system_events FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');