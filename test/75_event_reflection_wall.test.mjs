import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('75. 活動出隊足跡「山系拍立得心得牆 (Reflection Wall)」與公開/私密設定測試', () => {
  const wallModalContent = fs.readFileSync(path.resolve('src/components/achievements/ReflectionWallModal.tsx'), 'utf8');
  const achievementsContent = fs.readFileSync(path.resolve('src/pages/Achievements.tsx'), 'utf8');
  const supabaseClientContent = fs.readFileSync(path.resolve('src/utils/supabaseClient.ts'), 'utf8');
  const rpcSqlContent = fs.readFileSync(path.resolve('supabase/reflections_wall_rpc.sql'), 'utf8');
  const zhJson = JSON.parse(fs.readFileSync(path.resolve('src/locales/zh.json'), 'utf8'));
  const enJson = JSON.parse(fs.readFileSync(path.resolve('src/locales/en.json'), 'utf8'));

  it('1. 拍立得心得牆組件 (ReflectionWallModal) 應具備 3D 翻面、相片燈箱與 FAB 撰寫按鈕', () => {
    // 檢查 3D 翻面與視差立體效果
    assert.ok(
      wallModalContent.includes('transformStyle: \'preserve-3d\'') || wallModalContent.includes('preserve-3d'),
      'Card should support 3D transform style preserve-3d'
    );
    assert.ok(
      wallModalContent.includes('backfaceVisibility: \'hidden\'') || wallModalContent.includes('backface-visibility'),
      'Card backface should be hidden during 3D flip'
    );
    assert.ok(
      wallModalContent.includes('flippedCards') && wallModalContent.includes('toggleFlip'),
      'Component should have flip card toggle logic'
    );

    // 檢查點擊相片開啟全螢幕高畫質燈箱
    assert.ok(
      wallModalContent.includes('lightboxImages') && wallModalContent.includes('lightboxIndex'),
      'Component should have photo lightbox state'
    );

    // 檢查右下角 FAB 按鈕觸發撰寫
    assert.ok(
      wallModalContent.includes('onOpenWriteModal') || wallModalContent.includes('handleOpenWrite'),
      'Component should have write callback for FAB'
    );
    assert.ok(
      wallModalContent.includes('position: \'fixed\'') && wallModalContent.includes('bottom: \'24px\''),
      'FAB button should be fixed positioned at bottom-right'
    );
  });

  it('2. 出隊足跡卡片應極簡化且具備 ChevronRight，點擊開啟全螢幕心得牆，且心得撰寫 Modal 包含公開/私密切換', () => {
    // 檢查活動卡片點擊觸發 openWall
    assert.ok(
      achievementsContent.includes('onClick={() => openWall(item)}'),
      'Activity card should open reflection wall on click'
    );
    assert.ok(
      achievementsContent.includes('<ReflectionWallModal'),
      'Achievements.tsx should mount ReflectionWallModal'
    );

    // 檢查卡片已移除舊有的文字提示與子按鈕，改為簡約向右箭頭指示
    assert.ok(
      achievementsContent.includes('<ChevronRight size={18} />'),
      'Activity card should feature a clean ChevronRight arrow'
    );
    assert.ok(
      !achievementsContent.includes('• {t(\'achievements.wall.flipHint\''),
      'Activity card should not contain redundant tip text'
    );

    // 檢查心得牆組件接收 hasReflected 且 FAB 點擊直接開啟編輯模式
    assert.ok(
      achievementsContent.includes('hasReflected={wallEvent.hasReflected}'),
      'Achievements should pass hasReflected to ReflectionWallModal'
    );
    assert.ok(
      achievementsContent.includes('openForm(wallEvent, false, true)'),
      'Achievements should open directEdit mode if hasReflected is true'
    );

    // 檢查心得表單包含 isPublic 狀態與切換開關
    assert.ok(
      achievementsContent.includes('const [isPublic, setIsPublic] = useState(true)'),
      'Form should have isPublic state defaulting to true'
    );
    assert.ok(
      achievementsContent.includes('isPublicLabel') && achievementsContent.includes('role="switch"'),
      'Form should render a role="switch" toggle for reflection visibility'
    );

    // 檢查提交時傳送 isPublic 並更新心得牆
    assert.ok(
      achievementsContent.includes('isPublic') && achievementsContent.includes('setWallRefreshKey'),
      'handleSubmit should pass isPublic and trigger setWallRefreshKey'
    );

    // 檢查心得表單 Modal 的層級 (zIndex: 11000) 高於全螢幕心得牆 (zIndex: 9999)，避免被心得牆遮蓋
    assert.ok(
      achievementsContent.includes('zIndex: 11000'),
      'Form modal should have zIndex: 11000 to overlay ReflectionWallModal (zIndex: 9999)'
    );
  });

  it('3. Supabase Client 與 SQL 腳本應支援公開心得聚合 RPC 與 is_public 欄位', () => {
    // 檢查 fetchEventPublicReflections 函式
    assert.ok(
      supabaseClientContent.includes('export const fetchEventPublicReflections = async'),
      'supabaseClient should export fetchEventPublicReflections'
    );
    assert.ok(
      supabaseClientContent.includes('get_event_public_reflections_rpc'),
      'supabaseClient should call get_event_public_reflections_rpc'
    );

    // 檢查 ReflectionSubmitDetails 與 SupabaseReflection 包含 isPublic
    assert.ok(
      supabaseClientContent.includes('isPublic?: boolean;'),
      'ReflectionSubmitDetails/SupabaseReflection should have isPublic'
    );

    // 檢查 SQL 腳本中 schema migration 與 RPC 定義
    assert.ok(
      rpcSqlContent.includes('ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true'),
      'SQL migration should add is_public column to reflections table'
    );
    assert.ok(
      rpcSqlContent.includes('get_event_public_reflections_rpc'),
      'SQL migration should define get_event_public_reflections_rpc'
    );
    assert.ok(
      rpcSqlContent.includes('save_reflection_rpc'),
      'SQL migration should update save_reflection_rpc to handle is_public'
    );
  });

  it('4. 多國語言字典 (zh.json / en.json) 應包含心得牆與隱私設定翻譯詞彙', () => {
    // 中文字典檢驗
    assert.ok(zhJson.achievements?.wall?.title, 'zh.json should contain achievements.wall.title');
    assert.ok(zhJson.achievements?.wall?.emptyTitle, 'zh.json should contain achievements.wall.emptyTitle');
    assert.ok(zhJson.achievements?.wall?.flipHint, 'zh.json should contain achievements.wall.flipHint');
    assert.ok(zhJson.achievements?.modal?.isPublicLabel, 'zh.json should contain achievements.modal.isPublicLabel');
    assert.strictEqual(zhJson.achievements?.modal?.publicBadge, '公開');
    assert.strictEqual(zhJson.achievements?.modal?.privateBadge, '僅自己可見');

    // 英文字典檢驗
    assert.ok(enJson.achievements?.wall?.title, 'en.json should contain achievements.wall.title');
    assert.ok(enJson.achievements?.wall?.emptyTitle, 'en.json should contain achievements.wall.emptyTitle');
    assert.ok(enJson.achievements?.wall?.flipHint, 'en.json should contain achievements.wall.flipHint');
    assert.ok(enJson.achievements?.modal?.isPublicLabel, 'en.json should contain achievements.modal.isPublicLabel');
    assert.strictEqual(enJson.achievements?.modal?.publicBadge, 'Public');
    assert.strictEqual(enJson.achievements?.modal?.privateBadge, 'Private');
  });
});
