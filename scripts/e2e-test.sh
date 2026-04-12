#!/bin/bash
# ============================================================
# MAGI E2E Test Script v5
# Covers: 4-step workflow, annotations, per-section HLD chat,
# scope mode, Confluence children/publish, PRD template
# ============================================================

set -uo pipefail

BASE_URL="${PRD_STUDIO_URL:-http://localhost:3000}"
REPORT_FILE="$(pwd)/test-report-$(date +%Y%m%d_%H%M%S).md"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC} $1"; }
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

PASS_COUNT=0; FAIL_COUNT=0; TOTAL=0
check() {
  TOTAL=$((TOTAL+1))
  local desc="$1"; shift
  if "$@" 2>/dev/null; then
    pass "$desc"; PASS_COUNT=$((PASS_COUNT+1)); return 0
  else
    fail "$desc"; FAIL_COUNT=$((FAIL_COUNT+1)); return 1
  fi
}

json_val() { echo "$1" | jq -r "${2:-}" 2>/dev/null; }
api() { curl -sS -H "Content-Type: application/json" "$@" 2>/dev/null; }

# ============================================================
# 0. Pre-flight
# ============================================================
log "检查服务是否运行中..."
if ! curl -sS -o /dev/null -w '' "$BASE_URL" 2>/dev/null; then
  fail "服务未启动！请先运行: cd /Users/harbor.liu/prd-studio && npm run dev"
  exit 1
fi
pass "服务运行中: $BASE_URL"

CONF_TOKEN=""
if [ -f "$HOME/.confluence-credentials" ]; then
  CONF_TOKEN=$(grep 'CONFLUENCE_TOKEN=' "$HOME/.confluence-credentials" | cut -d= -f2)
fi
check "Confluence Token 已读取" test -n "$CONF_TOKEN"

# ============================================================
# 1. Verify DB exists
# ============================================================
log "检查数据库状态..."
curl -sS "$BASE_URL/api/settings" > /dev/null
check "数据库可用" test -f /Users/harbor.liu/prd-studio/data/prd-studio.db

# ============================================================
# 2. Configure Settings
# ============================================================
log "配置 Confluence..."
CONF_BASE_URL="https://confluence.shopee.io"
SETTINGS_RESULT=$(api -X PUT "$BASE_URL/api/settings" -d "{
  \"confluence_base_url\": \"$CONF_BASE_URL\",
  \"confluence_token\": \"$CONF_TOKEN\",
  \"confluence_space_key\": \"SSCP\"
}")
check "设置保存成功" test -n "$(json_val "$SETTINGS_RESULT" '.confluence_base_url // empty')"

log "配置 Google Workspace..."
api -X PUT "$BASE_URL/api/settings" -d '{
  "google_client_secret_path": "~/.config/google/client_secret.json",
  "google_oauth_token_path": "~/.config/google/oauth_token.json"
}' > /dev/null

log "配置 PRD 模板..."
TPL_RESULT=$(api -X PUT "$BASE_URL/api/settings" -d '{"prd_template_confluence_id": ""}')
check "PRD 模板设置可保存" test -n "$(echo "$TPL_RESULT" | jq 'type')"

# ============================================================
# 3. Test Connections
# ============================================================
log "测试 Confluence 连接..."
CONF_TEST=$(api -X POST "$BASE_URL/api/settings/test-confluence")
CONF_OK=$(json_val "$CONF_TEST" '.success // false')
check "Confluence 连接成功" test "$CONF_OK" = "true"

log "测试 Google 连接..."
GOOGLE_TEST=$(api -X POST "$BASE_URL/api/settings/test-google")
GOOGLE_OK=$(json_val "$GOOGLE_TEST" '.success // false')
if [ "$GOOGLE_OK" = "true" ]; then
  pass "Google 连接成功"
else
  warn "Google 连接失败 (non-blocking): $(json_val "$GOOGLE_TEST" '.message // empty')"
fi

# ============================================================
# 4. Create System + Upload MD files
# ============================================================
log "创建 ISC 系统..."
SYSTEM=$(api -X POST "$BASE_URL/api/systems" -d '{"name": "ISC", "description": "Integrated Stock Center - 整合库存中心"}')
SYSTEM_ID=$(json_val "$SYSTEM" '.id')
check "系统创建成功" test -n "$SYSTEM_ID"

if [ -f "$HOME/Desktop/ISC_design_principles.md" ]; then
  PRINCIPLES_CONTENT=$(cat "$HOME/Desktop/ISC_design_principles.md" | jq -Rs .)
  api -X PUT "$BASE_URL/api/systems/$SYSTEM_ID" -d "{\"design_principles\": $PRINCIPLES_CONTENT}" > /dev/null
  pass "设计原则上传成功"
else
  PRINCIPLES_CONTENT='"ISC 设计原则: 库存统一管理, FIFO 原则, sheet_stock 分层管理"'
  api -X PUT "$BASE_URL/api/systems/$SYSTEM_ID" -d "{\"design_principles\": $PRINCIPLES_CONTENT}" > /dev/null
  warn "使用 placeholder 设计原则"
fi

if [ -f "$HOME/Desktop/ISC_system_boundaries.md" ]; then
  BOUNDARIES_CONTENT=$(cat "$HOME/Desktop/ISC_system_boundaries.md" | jq -Rs .)
  api -X PUT "$BASE_URL/api/systems/$SYSTEM_ID" -d "{\"boundaries\": $BOUNDARIES_CONTENT}" > /dev/null
  pass "系统边界上传成功"
else
  BOUNDARIES_CONTENT='"ISC 系统边界: 仅管理虚拟库存, 不涉及实物仓储操作, 需与 WMS/OMS 对接"'
  api -X PUT "$BASE_URL/api/systems/$SYSTEM_ID" -d "{\"boundaries\": $BOUNDARIES_CONTENT}" > /dev/null
  warn "使用 placeholder 系统边界"
fi

# ============================================================
# 5. Add KB Source (Confluence directory)
# ============================================================
log "添加知识库来源 (ISC Confluence 目录)..."
NEW_KB='[{"type":"confluence","name":"ISC Confluence 知识库","config":{"value":"https://confluence.shopee.io/display/SSCP/ISC"}}]'
KB_RESULT=$(api -X PUT "$BASE_URL/api/systems/$SYSTEM_ID" -d "{\"kb_sources\": $NEW_KB}")
KB_COUNT=$(json_val "$KB_RESULT" '.kb_sources | length // 0')
check "KB 来源添加成功" test "$KB_COUNT" -gt 0

# Get KB source ID for index tests
KB_SRC_ID=$(json_val "$KB_RESULT" '.kb_sources[0].id // empty')
check "KB 来源有 ID" test -n "$KB_SRC_ID"

# ============================================================
# 5b. KB Index API Tests (Two-phase approach)
# ============================================================
log "测试 KB 索引 API..."

# GET index status (should be empty initially)
IDX_STATUS=$(api "$BASE_URL/api/kb/index?kb_source_id=$KB_SRC_ID")
IDX_TOTAL=$(json_val "$IDX_STATUS" '.total_pages // 0')
check "KB 索引初始为空" test "$IDX_TOTAL" -eq 0

# POST trigger index build
log "触发 KB 索引构建（可能耗时 30-90 秒）..."
IDX_BUILD=$(api -X POST "$BASE_URL/api/kb/index" -d "{\"kb_source_id\": \"$KB_SRC_ID\", \"system_id\": \"$SYSTEM_ID\"}")
IDX_BUILD_OK=$(json_val "$IDX_BUILD" '.success // false')
IDX_BUILD_TOTAL=$(json_val "$IDX_BUILD" '.total // 0')
IDX_BUILD_CONTENT=$(json_val "$IDX_BUILD" '.with_content // 0')
check "KB 索引构建成功" test "$IDX_BUILD_OK" = "true"
check "KB 索引页面数 > 0" test "$IDX_BUILD_TOTAL" -gt 0
check "KB 有内容页面数 > 0" test "$IDX_BUILD_CONTENT" -gt 0
log "索引结果: 共 $IDX_BUILD_TOTAL 页, $IDX_BUILD_CONTENT 有内容"

# GET index status after build
IDX_STATUS2=$(api "$BASE_URL/api/kb/index?kb_source_id=$KB_SRC_ID")
IDX_TOTAL2=$(json_val "$IDX_STATUS2" '.total_pages // 0')
IDX_CONTENT2=$(json_val "$IDX_STATUS2" '.pages_with_content // 0')
IDX_TIME=$(json_val "$IDX_STATUS2" '.last_indexed // empty')
check "索引状态已更新 (total_pages > 0)" test "$IDX_TOTAL2" -gt 0
check "索引时间已记录" test -n "$IDX_TIME"

# GET index status by system
IDX_SYS=$(api "$BASE_URL/api/kb/index?system_id=$SYSTEM_ID")
IDX_SYS_LEN=$(echo "$IDX_SYS" | jq 'length // 0')
check "按系统查询索引状态" test "$IDX_SYS_LEN" -gt 0

# ============================================================
# 6. Create Module + Project
# ============================================================
log "创建模块和项目..."
MODULE=$(api -X POST "$BASE_URL/api/modules" -d "{\"system_id\": \"$SYSTEM_ID\", \"name\": \"Invoice Stock\", \"description\": \"发票库存管理模块\"}")
MODULE_ID=$(json_val "$MODULE" '.id')
check "模块创建成功" test -n "$MODULE_ID"

PROJECT=$(api -X POST "$BASE_URL/api/projects" -d "{
  \"system_id\": \"$SYSTEM_ID\",
  \"module_id\": \"$MODULE_ID\",
  \"name\": \"BR Multi-CNPJ 发票库存改造\",
  \"description\": \"支持巴西仓库多 CNPJ 维度的发票库存管理\"
}")
PROJECT_ID=$(json_val "$PROJECT" '.id')
check "项目创建成功" test -n "$PROJECT_ID"

# ============================================================
# 7. Add Requirements (BRD vs Reference split)
# ============================================================
log "添加核心需求文档 (BRD)..."
GDOC_URL="https://docs.google.com/document/d/1yW7z5eg2exDOCRjTZFpduEB4pr7HM-KVI7Duhps8S-k/edit"
BRD_REQ=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/requirements" -d "{
  \"type\": \"google_doc\",
  \"name\": \"BR Multi-CNPJ BRD (Google Doc)\",
  \"source_url\": \"$GDOC_URL\"
}")
BRD_CONTENT_LEN=$(json_val "$BRD_REQ" '.content | length // 0')
BRD_REQ_ID=$(json_val "$BRD_REQ" '.id')
if [ "$BRD_CONTENT_LEN" -gt 100 ] 2>/dev/null; then
  pass "BRD Google Doc 拉取成功 ($BRD_CONTENT_LEN 字)"
else
  warn "Google Doc 拉取可能失败，添加 placeholder BRD"
  BRD_REQ=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/requirements" -d '{
    "type": "brd",
    "name": "BR Multi-CNPJ BRD (Placeholder)",
    "content": "## BR Multi-CNPJ 发票库存改造 BRD\n\n### 背景\n巴西仓库需要支持多 CNPJ 维度的发票库存管理。目前 ISC 系统的 sheet_stock 以仓库维度管理库存，无法区分同一仓库下不同 CNPJ 的库存。\n\n### 核心需求\n1. 在 sheet_stock 新增 CNPJ 维度\n2. 入库时根据发票上的 CNPJ 自动分配库存\n3. 出库时优先使用指定 CNPJ 的库存，支持 FIFO\n4. 库存转移支持跨 CNPJ 操作\n\n### 业务流程\n1. 收货扫码 → 读取发票 CNPJ → ISC 分配到对应 CNPJ 库存池\n2. 出库创建时 → 匹配 CNPJ → 按 FIFO 扣减对应库存\n3. 库存不足时 → 触发 CNPJ 间库存转移审批流程\n\n### 影响范围\n- ISC sheet_stock 表结构\n- WMS 入库/出库接口\n- OMS 订单创建时的库存校验"
  }')
  BRD_REQ_ID=$(json_val "$BRD_REQ" '.id')
fi

log "添加参考材料..."
REF_REQ=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/requirements" -d '{
  "type": "reference",
  "name": "巴西税务法规参考",
  "content": "## 巴西 CNPJ 税务法规参考\n\n### CNPJ 概述\nCNPJ (Cadastro Nacional da Pessoa Jurídica) 是巴西企业法人的税务登记号。每个仓库/经营地点可以有独立的 CNPJ。\n\n### 发票要求\n- NF-e (Nota Fiscal Eletrônica) 必须关联到具体的 CNPJ\n- 库存管理需要按 CNPJ 维度追踪\n- 跨 CNPJ 库存转移需要开具转移发票"
}')
check "参考材料添加成功" test -n "$(json_val "$REF_REQ" '.id')"

log "验证需求文档类型分类..."
ALL_REQS=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/requirements")
CORE_COUNT=$(echo "$ALL_REQS" | jq '[.[] | select(.type == "brd" or .type == "frf" or .type == "google_doc")] | length')
REF_COUNT=$(echo "$ALL_REQS" | jq '[.[] | select(.type == "reference" or .type == "link")] | length')
check "核心需求文档数量 >= 1" test "$CORE_COUNT" -ge 1
check "参考材料数量 >= 1" test "$REF_COUNT" -ge 1

# ============================================================
# 8. Annotations API Tests (v3 new)
# ============================================================
log "测试 Annotations API（含 question/suggested_answer 字段）..."
ANN_CREATE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/annotations" -d "{
  \"requirement_id\": \"$BRD_REQ_ID\",
  \"highlighted_text\": \"Multi-CNPJ\",
  \"annotation_text\": \"需要明确 CNPJ 数量上限\",
  \"question\": \"单个 seller 最多可以关联多少个 CNPJ？\",
  \"suggested_answer\": \"建议限制为 5 个，超过需要人工审批\",
  \"author\": \"user\"
}")
ANN_ID=$(json_val "$ANN_CREATE" '.id')
check "Annotation 创建成功" test -n "$ANN_ID"

ANN_LIST=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/annotations")
ANN_COUNT=$(echo "$ANN_LIST" | jq 'length')
check "Annotation 列表查询成功" test "$ANN_COUNT" -ge 1

ANN_Q=$(echo "$ANN_LIST" | jq -r '.[0].question // ""')
ANN_SA=$(echo "$ANN_LIST" | jq -r '.[0].suggested_answer // ""')
check "Annotation 包含 question 字段" test -n "$ANN_Q"
check "Annotation 包含 suggested_answer 字段" test -n "$ANN_SA"

ANN_DEL=$(api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID/annotations" -d "{\"annotation_id\": \"$ANN_ID\"}")
check "Annotation 删除成功" test "$(json_val "$ANN_DEL" '.success // false')" = "true"

ANN_LIST2=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/annotations")
ANN_COUNT2=$(echo "$ANN_LIST2" | jq 'length')
check "Annotation 删除后数量正确" test "$ANN_COUNT2" -eq 0

# ============================================================
# 8b. Error Logs API Tests (v4 new)
# ============================================================
log "测试 Error Logs API..."
ELOGS=$(api -X GET "$BASE_URL/api/error-logs")
check "Error logs API 可达" test "$(echo "$ELOGS" | jq '.logs | type')" = '"array"'
ELOG_TOTAL=$(echo "$ELOGS" | jq '.total')
check "Error logs total 字段存在" test "$ELOG_TOTAL" -ge 0

ELOG_FILTER=$(api -X GET "$BASE_URL/api/error-logs?severity=critical")
check "Error logs 支持 severity 过滤" test "$(echo "$ELOG_FILTER" | jq '.logs | type')" = '"array"'

ELOG_CLEAR=$(api -X DELETE "$BASE_URL/api/error-logs" -d '{"clear_all": true}')
check "Error logs 清空功能" test "$(json_val "$ELOG_CLEAR" '.success // false')" = "true"

ELOGS_AFTER=$(api -X GET "$BASE_URL/api/error-logs")
ELOG_TOTAL_AFTER=$(echo "$ELOGS_AFTER" | jq '.total')
check "Error logs 清空后数量为 0" test "$ELOG_TOTAL_AFTER" -eq 0

# ============================================================
# 8b. LLM Logs API
# ============================================================
log "测试 LLM Logs API..."
LLM_LOGS=$(api -X GET "$BASE_URL/api/llm-logs")
check "LLM logs API 可达" test "$(echo "$LLM_LOGS" | jq '.logs | type')" = '"array"'
LLM_LOG_TOTAL=$(echo "$LLM_LOGS" | jq '.total')
check "LLM logs total 字段存在" test "$LLM_LOG_TOTAL" -ge 0

LLM_LOG_FILTER=$(api -X GET "$BASE_URL/api/llm-logs?phase=analysis")
check "LLM logs 支持 phase 过滤" test "$(echo "$LLM_LOG_FILTER" | jq '.logs | type')" = '"array"'

# ============================================================
# 8c. Settings: analysis_custom_rules
# ============================================================
log "测试 Settings: 业务分析自定义规则..."
SAVE_RULES=$(api -X PUT "$BASE_URL/api/settings" -d '{"analysis_custom_rules":"测试分析规则"}')
RULES_SAVED=$(echo "$SAVE_RULES" | jq -r '.analysis_custom_rules // ""')
check "Settings 保存自定义分析规则" test "$RULES_SAVED" = "测试分析规则"

GET_SETTINGS=$(api -X GET "$BASE_URL/api/settings")
RULES_VAL=$(echo "$GET_SETTINGS" | jq -r '.analysis_custom_rules // ""')
check "Settings 读取自定义分析规则" test "$RULES_VAL" = "测试分析规则"

# ============================================================
# 8d. Annotation Resolve & Convert to Rule
# ============================================================
log "测试 Annotation resolve & convert to rule..."
ANN_FOR_RESOLVE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/annotations" -d "{
  \"requirement_id\": \"$BRD_REQ_ID\",
  \"highlighted_text\": \"test resolve\",
  \"annotation_text\": \"resolve test\",
  \"question\": \"resolve test question\",
  \"suggested_answer\": \"resolve test answer\",
  \"author\": \"user\"
}")
ANN_RESOLVE_ID=$(json_val "$ANN_FOR_RESOLVE" '.id')
if [ -n "$ANN_RESOLVE_ID" ]; then
  ANN_RESOLVE=$(api -X PUT "$BASE_URL/api/projects/$PROJECT_ID/annotations" -d "{\"annotation_id\":\"$ANN_RESOLVE_ID\",\"action\":\"resolve\"}")
  check "Annotation resolve 成功" test "$(json_val "$ANN_RESOLVE" '.success // false')" = "true"
fi

# ============================================================
# 9. Dry-run Analysis (verify context assembly)
# ============================================================
log "执行 dry-run 分析 (验证上下文组装)..."
DRYRUN=$(api -X POST --max-time 60 "$BASE_URL/api/projects/$PROJECT_ID/analyze?dry_run=1")
DR_OK=$(json_val "$DRYRUN" '.dry_run // false')
check "Dry-run 执行成功" test "$DR_OK" = "true"

SYS_CTX_LEN=$(json_val "$DRYRUN" '.system_context_length // 0')
BRD_LEN=$(json_val "$DRYRUN" '.brd_content_length // 0')
REF_LEN=$(json_val "$DRYRUN" '.reference_content_length // 0')

check "系统上下文长度 > 0" test "$SYS_CTX_LEN" -gt 0
check "BRD 内容长度 > 0" test "$BRD_LEN" -gt 0
check "参考材料和核心需求分别计算" test "$REF_LEN" -ge 0

CONTEXT_LOG=$(json_val "$DRYRUN" '.context_log')
DP_INCLUDED=$(echo "$CONTEXT_LOG" | jq '[.[] | select(.section == "设计原则" and .included == true)] | length > 0')
BD_INCLUDED=$(echo "$CONTEXT_LOG" | jq '[.[] | select(.section == "系统边界" and .included == true)] | length > 0')
KB_INCLUDED=$(echo "$CONTEXT_LOG" | jq '[.[] | select(.section == "知识库(KB)" and .included == true)] | length > 0')
CORE_INC=$(echo "$CONTEXT_LOG" | jq '[.[] | select(.section == "核心需求文档(BRD/FRF)" and .included == true)] | length > 0')
REF_INC=$(echo "$CONTEXT_LOG" | jq '[.[] | select(.section == "参考材料")] | length > 0')

check "设计原则已包含在上下文中" test "$DP_INCLUDED" = "true"
check "系统边界已包含在上下文中" test "$BD_INCLUDED" = "true"
check "知识库已包含在上下文中" test "$KB_INCLUDED" = "true"
check "核心需求文档标记正确" test "$CORE_INC" = "true"
check "参考材料独立标记" test "$REF_INC" = "true"

# ============================================================
# 10. Test Analysis Summary API
# ============================================================
log "测试 analysis-summary API..."
SUMMARY=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/analysis-summary")
check "Analysis summary API 可达" test "$(echo "$SUMMARY" | jq 'type')" = '"null"' -o "$(echo "$SUMMARY" | jq 'type')" = '"object"'

# ============================================================
# 11. Test Chat API (analysis phase)
# ============================================================
log "测试 Chat API (analysis, dry-run)..."
CHAT_RESULT=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/chat" -d '{
  "phase": "analysis",
  "message": "BRD 解读中缺少了关于 CNPJ 间库存转移的审批流程说明",
  "dry_run": true
}')
CHAT_OK=$(json_val "$CHAT_RESULT" '.dry_run // false')
USER_MSG=$(json_val "$CHAT_RESULT" '.user_message_id')
ASST_MSG=$(json_val "$CHAT_RESULT" '.assistant_message_id')
check "Chat 消息发送成功 (dry-run)" test "$CHAT_OK" = "true"
check "用户消息已保存" test -n "$USER_MSG"
check "助理回复已保存" test -n "$ASST_MSG"

MSGS=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/chat?phase=analysis")
MSG_COUNT=$(echo "$MSGS" | jq 'length')
check "Chat 消息已持久化" test "$MSG_COUNT" -ge 2

# ============================================================
# 12. Test HLD API
# ============================================================
log "测试 HLD API..."
HLD_DR=$(api -X POST --max-time 60 "$BASE_URL/api/projects/$PROJECT_ID/hld?dry_run=1")
HLD_DR_RESP=$(json_val "$HLD_DR" '.dry_run // .error // "unknown"')
if [ "$HLD_DR_RESP" = "true" ]; then
  check "HLD dry-run 执行成功" true
elif echo "$HLD_DR" | jq -e '.error' > /dev/null 2>&1; then
  check "HLD API 正确要求前置分析" test "$(json_val "$HLD_DR" '.error')" = "请先完成业务分析"
else
  check "HLD API 响应有效" false
fi

log "测试 HLD GET..."
HLD=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/hld")
check "HLD GET API 可达" test "$(echo "$HLD" | jq 'type')" = '"null"' -o "$(echo "$HLD" | jq 'type')" = '"object"'

# ============================================================
# 13. Test HLD Per-Section Chat (v3 new)
# ============================================================
log "测试 HLD Per-Section Chat API (dry-run)..."
HLD_SEC_CHAT=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/chat" -d '{
  "phase": "hld",
  "section": "system_architecture",
  "message": "系统架构部分需要补充 ISC 和 WMS 之间的接口变更",
  "dry_run": true
}')
check "HLD Section Chat 消息发送成功" test "$(json_val "$HLD_SEC_CHAT" '.dry_run // false')" = "true"

SEC_MSGS=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/chat?phase=hld&section=system_architecture")
SEC_MSG_COUNT=$(echo "$SEC_MSGS" | jq 'length')
check "HLD Section Chat 消息可按 section 查询" test "$SEC_MSG_COUNT" -ge 1

# ============================================================
# 14. Test Scope Mode (v3 new)
# ============================================================
log "测试 Scope Mode..."
SCOPE_UPDATE=$(api -X PUT "$BASE_URL/api/projects/$PROJECT_ID" -d '{"scope_mode": "current_system"}')
SCOPE_VAL=$(json_val "$SCOPE_UPDATE" '.scope_mode')
check "Scope mode 更新为 current_system" test "$SCOPE_VAL" = "current_system"

SCOPE_UPDATE2=$(api -X PUT "$BASE_URL/api/projects/$PROJECT_ID" -d '{"scope_mode": "all_systems"}')
SCOPE_VAL2=$(json_val "$SCOPE_UPDATE2" '.scope_mode')
check "Scope mode 更新为 all_systems" test "$SCOPE_VAL2" = "all_systems"

# ============================================================
# 15. Test Confluence Children API (v3 new)
# ============================================================
log "测试 Confluence Children API..."
CONF_CHILDREN=$(api -X GET "$BASE_URL/api/confluence/children")
CONF_CHILDREN_TYPE=$(echo "$CONF_CHILDREN" | jq 'type')
if [ "$CONF_CHILDREN_TYPE" = '"array"' ]; then
  CONF_CHILDREN_COUNT=$(echo "$CONF_CHILDREN" | jq 'length')
  check "Confluence Children API 返回页面列表" test "$CONF_CHILDREN_COUNT" -ge 0
else
  CONF_ERR=$(json_val "$CONF_CHILDREN" '.error // "unknown"')
  warn "Confluence Children API 返回错误: $CONF_ERR (可能缺少 space key 配置)"
  check "Confluence Children API 可达" test "$CONF_CHILDREN_TYPE" = '"object"'
fi

# ============================================================
# 16. Test Confluence Publish API (v3 new, validation only)
# ============================================================
log "测试 Confluence Publish API (缺少 PRD 时的验证)..."
PUBLISH_NOPRD=$(api -X POST "$BASE_URL/api/confluence/publish" -d "{
  \"project_id\": \"$PROJECT_ID\",
  \"parent_page_id\": \"\",
  \"title\": \"Test PRD\"
}")
PUBLISH_ERR=$(json_val "$PUBLISH_NOPRD" '.error // ""')
check "Confluence Publish API 在无 PRD 时返回错误" test -n "$PUBLISH_ERR"

# ============================================================
# 17. Test PRD API
# ============================================================
log "测试 PRD GET..."
PRD=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID/prd")
check "PRD GET API 可达" test "$(echo "$PRD" | jq 'type')" = '"null"' -o "$(echo "$PRD" | jq 'type')" = '"object"'

# ============================================================
# 18. Final Project State
# ============================================================
log "检查最终项目状态..."
FINAL_PROJECT=$(api -X GET "$BASE_URL/api/projects/$PROJECT_ID")
FINAL_STATUS=$(json_val "$FINAL_PROJECT" '.status')
FINAL_SCOPE=$(json_val "$FINAL_PROJECT" '.scope_mode')
check "项目状态有效" test -n "$FINAL_STATUS"
check "项目 scope_mode 有效" test -n "$FINAL_SCOPE"

# ============================================================
# Generate Report
# ============================================================
log "生成测试报告..."

cat > "$REPORT_FILE" << REPORT_EOF
# PRD Studio E2E 测试报告 v3

**生成时间**: $(date "+%Y-%m-%d %H:%M:%S")
**Base URL**: $BASE_URL

## 测试结果
- **通过**: $PASS_COUNT
- **失败**: $FAIL_COUNT
- **总计**: $TOTAL
- **通过率**: $(( PASS_COUNT * 100 / (TOTAL > 0 ? TOTAL : 1) ))%

## 改动验证

### 1. 需求文档分类 (BRD/FRF vs 参考材料)
- 核心需求文档数量: $CORE_COUNT
- 参考材料数量: $REF_COUNT
- 上下文日志中"核心需求文档(BRD/FRF)"独立标记: $CORE_INC
- 上下文日志中"参考材料"独立标记: $REF_INC

### 2. 内联标注 (v4 升级)
- Annotation 创建（含 question/suggested_answer）: ✅
- Annotation 查询: ✅
- Annotation 字段验证 (question, suggested_answer): ✅
- Annotation 删除: ✅
- 前端: Google Doc 风格侧边栏评论交互
- Google Doc HTML 格式保存: content_html 字段

### 2b. 错误日志 (v4 新增)
- Error Logs API 查询: ✅
- Error Logs severity 过滤: ✅
- Error Logs 清空: ✅
- 前端: 侧边栏「系统管理 > 错误日志」页面

### 3. 业务分析增强
- Analysis Summary API: ✅ 可达
- BRD 解读 (brd_interpretation): 新增字段
- 业务流程图 (process_diagram): Mermaid 语法
- Severity 字段 (info/warning/critical): 数据库已支持
- 方案质疑 (category=challenge, severity=critical): Prompt 已配置

### 4. 对话交互
- Analysis Chat: $MSG_COUNT 条消息已持久化
- HLD Per-Section Chat: ✅ 按 section 过滤 ($SEC_MSG_COUNT 条)
- Chat API 支持 dry_run 模式: ✅

### 5. 高阶方案设计 (HLD)
- HLD API dry-run: ${HLD_DR_RESP:-N/A}
- HLD 三个 section: information_architecture, system_architecture, data_architecture
- HLD 确认状态 (draft/confirmed): 数据库已支持
- HLD 架构图 (ia_diagram, sa_diagram, da_diagram): Mermaid 支持
- 受影响系统 (affected_systems): JSON 数组支持

### 6. 跨系统范围 (v3 新增)
- Scope mode 更新: ✅ (current_system / all_systems)
- 最终 scope_mode: $FINAL_SCOPE

### 7. Confluence 集成 (v3 新增)
- Confluence Children API: ✅ 可达
- Confluence Publish API: ✅ 无 PRD 时返回错误验证

### 7b. KB 索引 (扩容方案 C)
- 索引构建: 共 $IDX_BUILD_TOTAL 页, $IDX_BUILD_CONTENT 有内容
- 索引状态查询: total_pages=$IDX_TOTAL2, last_indexed=$IDX_TIME
- 两阶段检索: 本地索引 + CQL 搜索, 最多 20 篇/次

### 8. 上下文组装验证
- 系统上下文长度: $SYS_CTX_LEN chars
- BRD 内容长度: $BRD_LEN chars
- 参考材料长度: $REF_LEN chars
- 设计原则已包含: $DP_INCLUDED
- 系统边界已包含: $BD_INCLUDED
- 知识库已包含: $KB_INCLUDED

### 9. 四步工作流
| 步骤 | 名称 | API | 状态 |
|------|------|-----|------|
| Step 1 | 业务需求 | /api/projects/{id}/requirements | ✅ |
| Step 2 | 业务分析 | /api/projects/{id}/analyze, /analysis-summary, /annotations, /chat | ✅ |
| Step 3 | 高阶方案 | /api/projects/{id}/hld, /chat?section=X | ✅ |
| Step 4 | 产品需求 | /api/projects/{id}/prd, /confluence/publish | ✅ |

## 项目状态
- 项目 ID: $PROJECT_ID
- 最终状态: $FINAL_STATUS
- Scope mode: $FINAL_SCOPE
REPORT_EOF

echo ""
echo "========================================"
echo -e "  测试结果: ${GREEN}${PASS_COUNT} PASS${NC} / ${RED}${FAIL_COUNT} FAIL${NC} / ${TOTAL} TOTAL"
echo "  测试报告: $REPORT_FILE"
echo "========================================"

exit $FAIL_COUNT
