/* ============================================================
 * clue-wall.js — demo data and the clue wall's spatial model
 * ============================================================ */

(() => {
  const PERIOD_WIDTH = 3200;
  const PERIOD_HEIGHT = 2560;
  const CELL_SIZE = 320;
  const STORAGE_KEY = 'fantaui.clue-wall.positions.v1';
  const cards = [
    {
      id: 'move-date',
      type: 'note',
      title: '搬家日期已敲定',
      body: '12 月 14 日上午交接新家钥匙，搬家公司约在 9:00 到旧家。电梯预约需要提前三天确认。',
      source: '家庭备忘 · 演示资料',
      importance: 96,
      relevance: 93,
      x: 1130,
      y: 920,
      width: 290,
      height: 190,
    },
    {
      id: 'packing-list',
      type: 'file',
      title: '全屋打包清单',
      description: '按房间整理的打包清单，含易碎品与优先拆箱标记。',
      fileName: 'packing-list.csv',
      fileSize: '2.4 KB',
      href: 'assets/packing-list.csv',
      source: '本地文件 · 演示资料',
      importance: 89,
      relevance: 88,
      x: 1510,
      y: 850,
      width: 290,
      height: 200,
    },
    {
      id: 'new-home-photo',
      type: 'image',
      title: '新家客厅现场',
      description: '交房时拍摄的客厅与采光情况。',
      image: 'assets/new-home-living-room.svg',
      imageAlt: '浅色客厅的搬家情境示意图',
      source: '手机相册 · 演示图片',
      importance: 78,
      relevance: 82,
      x: 1890,
      y: 850,
      width: 300,
      height: 290,
    },
    {
      id: 'moving-quote',
      type: 'file',
      title: '搬家报价记录',
      description: '两家搬运服务的报价与服务范围对比。',
      fileName: 'moving-quote.txt',
      fileSize: '1.1 KB',
      href: 'assets/moving-quote.txt',
      source: '咨询记录 · 演示资料',
      importance: 84,
      relevance: 76,
      x: 2260,
      y: 1100,
      width: 290,
      height: 200,
    },
    {
      id: 'room-measurements',
      type: 'image',
      title: '新家尺寸草图',
      description: '客厅墙面与主要家具的预估摆放尺寸。',
      image: 'assets/new-home-layout.svg',
      imageAlt: '标有墙面长度的客厅平面示意图',
      source: '尺寸记录 · 演示图片',
      importance: 90,
      relevance: 91,
      x: 790,
      y: 1270,
      width: 300,
      height: 285,
    },
    {
      id: 'fragile-boxes',
      type: 'image',
      title: '易碎物品打包',
      description: '餐具和玻璃器皿单独装箱，外箱标注“易碎”。',
      image: 'assets/moving-boxes.svg',
      imageAlt: '贴有易碎标签的搬家纸箱示意图',
      source: '打包记录 · 演示图片',
      importance: 71,
      relevance: 80,
      x: 1150,
      y: 1320,
      width: 300,
      height: 285,
    },
    {
      id: 'address-change',
      type: 'note',
      title: '记得更新收件地址',
      body: '搬家前检查快递、银行账单和常用订阅服务的收件地址，旧门禁卡交接时一并归还。',
      source: '待办摘录 · 演示资料',
      importance: 73,
      relevance: 69,
      x: 1510,
      y: 1190,
      width: 290,
      height: 190,
    },
    {
      id: 'search-elevator',
      type: 'search',
      title: '搜索结果：搬家电梯预约',
      description: '物业服务页面提到，周末搬运需要提前登记车辆和电梯使用时段。',
      source: '网页搜索 · 示例结果',
      importance: 82,
      relevance: 87,
      x: 1880,
      y: 1240,
      width: 310,
      height: 210,
    },
    {
      id: 'inventory',
      type: 'file',
      title: '家具与电器盘点',
      description: '旧家物品去留记录，方便核对搬运数量。',
      fileName: 'home-inventory.csv',
      fileSize: '1.7 KB',
      href: 'assets/home-inventory.csv',
      source: '本地文件 · 演示资料',
      importance: 76,
      relevance: 74,
      x: 850,
      y: 1680,
      width: 290,
      height: 200,
    },
    {
      id: 'internet-transfer',
      type: 'note',
      title: '宽带迁移安排',
      body: '先确认新小区的可选套餐和入户位置，再约师傅在搬家后一周内上门。',
      source: '搜索摘录 · 演示资料',
      importance: 68,
      relevance: 72,
      x: 1540,
      y: 1680,
      width: 290,
      height: 190,
    },
  ];

  const byId = new Map(cards.map((card) => [card.id, card]));
  const cells = new Map();
  const cardCellKeys = new Map();
  let storageWarning = '';

  const cellKey = (x, y) => `${x},${y}`;
  const modulo = (value, period) => ((value % period) + period) % period;

  function reportStorageWarning(message, error) {
    storageWarning = message;
    if (error) console.warn(message, error);
  }

  function readSavedPositions() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      reportStorageWarning('浏览器不允许读取本地线索位置，将使用演示布局。', error);
      return;
    }

    if (!raw) return;

    try {
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        throw new TypeError('保存的位置格式无效。');
      }

      Object.entries(saved).forEach(([id, position]) => {
        const card = byId.get(id);
        if (!card || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
        card.x = modulo(position.x, PERIOD_WIDTH);
        card.y = modulo(position.y, PERIOD_HEIGHT);
      });
    } catch (error) {
      reportStorageWarning('本地线索位置无法解析，将使用演示布局。', error);
    }
  }

  function splitWrappedRange(start, length, period) {
    const end = start + length;
    return end <= period
      ? [[start, end]]
      : [[start, period], [0, end - period]];
  }

  function cardSegments(card) {
    const xSegments = splitWrappedRange(card.x, card.width, PERIOD_WIDTH);
    const ySegments = splitWrappedRange(card.y, card.height, PERIOD_HEIGHT);
    return xSegments.flatMap(([left, right]) =>
      ySegments.map(([top, bottom]) => ({ left, right, top, bottom })),
    );
  }

  function addToIndex(card) {
    const keys = new Set();
    cardSegments(card).forEach(({ left, right, top, bottom }) => {
      const firstX = Math.floor(left / CELL_SIZE);
      const lastX = Math.floor(Math.max(left, right - 0.001) / CELL_SIZE);
      const firstY = Math.floor(top / CELL_SIZE);
      const lastY = Math.floor(Math.max(top, bottom - 0.001) / CELL_SIZE);

      for (let x = firstX; x <= lastX; x += 1) {
        for (let y = firstY; y <= lastY; y += 1) {
          const key = cellKey(x, y);
          if (!cells.has(key)) cells.set(key, new Set());
          cells.get(key).add(card.id);
          keys.add(key);
        }
      }
    });
    cardCellKeys.set(card.id, keys);
  }

  function removeFromIndex(card) {
    cardCellKeys.get(card.id)?.forEach((key) => {
      const ids = cells.get(key);
      if (!ids) return;
      ids.delete(card.id);
      if (ids.size === 0) cells.delete(key);
    });
    cardCellKeys.delete(card.id);
  }

  function query(rect) {
    const left = Math.max(0, rect.left);
    const right = Math.min(PERIOD_WIDTH, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(PERIOD_HEIGHT, rect.bottom);
    if (right <= left || bottom <= top) return [];

    const firstX = Math.floor(left / CELL_SIZE);
    const lastX = Math.floor(Math.max(left, right - 0.001) / CELL_SIZE);
    const firstY = Math.floor(top / CELL_SIZE);
    const lastY = Math.floor(Math.max(top, bottom - 0.001) / CELL_SIZE);
    const ids = new Set();

    for (let x = firstX; x <= lastX; x += 1) {
      for (let y = firstY; y <= lastY; y += 1) {
        cells.get(cellKey(x, y))?.forEach((id) => ids.add(id));
      }
    }

    return Array.from(ids, (id) => byId.get(id)).filter((card) =>
      cardSegments(card).some((segment) =>
        segment.left < right &&
        segment.right > left &&
        segment.top < bottom &&
        segment.bottom > top,
      ),
    );
  }

  function savePositions() {
    const positions = Object.fromEntries(cards.map(({ id, x, y }) => [id, { x, y }]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
      storageWarning = '';
    } catch (error) {
      reportStorageWarning('无法保存线索位置；当前布局在关闭页面后不会保留。', error);
      return false;
    }
    return true;
  }

  function moveCard(id, x, y) {
    const card = byId.get(id);
    if (!card || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    removeFromIndex(card);
    card.x = modulo(x, PERIOD_WIDTH);
    card.y = modulo(y, PERIOD_HEIGHT);
    addToIndex(card);
    return true;
  }

  readSavedPositions();
  cards.forEach(addToIndex);

  window.clueWall = {
    cards,
    periodWidth: PERIOD_WIDTH,
    periodHeight: PERIOD_HEIGHT,
    query,
    moveCard,
    savePositions,
    getStorageWarning: () => storageWarning,
  };
})();
