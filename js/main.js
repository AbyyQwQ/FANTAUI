/* ============================================================
 * main.js — 页面入口与空间交互
 * ============================================================ */

const main = document.querySelector('.main');
main?.addEventListener('scroll', () => {
  document.body.classList.toggle('is-scrolled', main.scrollTop > 4);
}, { passive: true });

const plane = document.querySelector('#space-plane');
const world = document.querySelector('#space-world');
const canvas = document.querySelector('#space-effect');
const status = document.querySelector('#space-status');
const zoomReadout = document.querySelector('#space-zoom');
const settingsDialog = document.querySelector('#space-settings');
const sensitivitySlider = document.querySelector('#zoom-sensitivity');
const sensitivityValue = document.querySelector('#zoom-sensitivity-value');
const context = canvas?.getContext('2d');
const clueWall = window.clueWall;

if (plane && world && canvas && status && clueWall) {
  const APPEAR_MS = 900;
  const MOTION_MS = 400;
  const ENTRY_MS = APPEAR_MS + MOTION_MS;
  const RADIAL_STAGGER_MS = 240;
  const PARTICLE_COUNT = 6000;
  const MAX_ZOOM = 1.8;
  const OVERSCAN_PX = 160;
  const MAX_CYCLES_PER_AXIS = 3;
  const BASE_WHEEL_SENSITIVITY = 0.0018;
  const ZOOM_EASE_MS = 38;
  const SETTINGS_STORAGE_KEY = 'fantaui.space-settings.v1';
  let cameraX = clueWall.periodWidth / 2;
  let cameraY = clueWall.periodHeight / 2;
  let targetCameraX = cameraX;
  let targetCameraY = cameraY;
  let zoom = 1;
  let targetZoom = zoom;
  let wheelZoomSensitivity = 1;
  let mode = 'idle';
  // let drag = null; // Pointer dragging is disabled; zoom-at-pointer moves the view.
  let altPress = null;
  let animationStart = 0;
  let animationFrame = 0;
  let particles = [];
  let statusTimer = 0;
  let lockPending = false;
  let lockAcquired = false;
  let lockFailed = false;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let sceneFrame = 0;
  let lastSceneTime = 0;
  const renderedCards = new Map();

  const setMode = (nextMode) => {
    mode = nextMode;
    document.body.dataset.spaceMode = nextMode;
  };

  const cycle = (value, period) => ((value % period) + period) % period;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function getMinZoom() {
    const width = Math.max(1, plane.clientWidth);
    const height = Math.max(1, plane.clientHeight);
    return Math.max(
      0.25,
      (width + OVERSCAN_PX * 2) / (clueWall.periodWidth * MAX_CYCLES_PER_AXIS),
      (height + OVERSCAN_PX * 2) / (clueWall.periodHeight * MAX_CYCLES_PER_AXIS),
    );
  }

  function clampZoom(value) {
    return clamp(value, Math.min(MAX_ZOOM, getMinZoom()), MAX_ZOOM);
  }

  function showStatus(message) {
    window.clearTimeout(statusTimer);
    status.textContent = message;
    status.classList.add('is-visible');
    statusTimer = window.setTimeout(() => {
      status.classList.remove('is-visible');
    }, 3200);
  }

  function updateSensitivityControl() {
    if (sensitivitySlider) sensitivitySlider.value = wheelZoomSensitivity.toFixed(1);
    if (sensitivityValue) sensitivityValue.textContent = `${wheelZoomSensitivity.toFixed(1)}×`;
  }

  function restoreSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        if (!settings || !Number.isFinite(settings.wheelZoomSensitivity)) {
          throw new TypeError('设置格式无效。');
        }
        wheelZoomSensitivity = clamp(settings.wheelZoomSensitivity, 0.5, 3);
      }
    } catch (error) {
      showStatus('无法读取缩放设置，将使用默认灵敏度。');
      console.warn('无法读取缩放设置。', error);
    }
    updateSensitivityControl();
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ wheelZoomSensitivity }),
      );
    } catch (error) {
      showStatus('无法保存缩放设置；刷新后将恢复默认灵敏度。');
      console.warn('无法保存缩放设置。', error);
    }
  }

  function makeCardElement(card) {
    const element = document.createElement('article');
    element.className = `clue-card clue-card--${card.type}`;
    element.dataset.cardId = card.id;
    element.style.width = `${card.width}px`;
    element.style.height = `${card.height}px`;
    element.draggable = false;

    const meta = document.createElement('div');
    meta.className = 'clue-card__meta';
    const kind = document.createElement('span');
    kind.className = 'clue-card__kind';
    kind.textContent = {
      note: '备忘',
      file: '文件',
      image: '图片',
      search: '搜索结果',
    }[card.type] || '资料';
    const demo = document.createElement('span');
    demo.className = 'clue-card__demo';
    demo.textContent = '演示分值';
    meta.append(kind, demo);

    const title = document.createElement('h2');
    title.className = 'clue-card__title';
    title.textContent = card.title;
    element.append(meta, title);

    if (card.type === 'image') {
      const description = document.createElement('p');
      description.className = 'clue-card__description';
      description.textContent = card.description;
      const image = document.createElement('img');
      image.className = 'clue-card__image';
      image.src = card.image;
      image.alt = card.imageAlt;
      image.loading = 'lazy';
      image.decoding = 'async';
      element.append(description, image);
    } else if (card.type === 'file') {
      const description = document.createElement('p');
      description.className = 'clue-card__description';
      description.textContent = card.description;
      const file = document.createElement('a');
      file.className = 'clue-card__file';
      file.href = card.href;
      file.download = card.fileName;
      file.setAttribute('aria-label', `下载 ${card.fileName}`);
      const fileName = document.createElement('span');
      fileName.className = 'clue-card__file-name';
      fileName.textContent = card.fileName;
      const fileSize = document.createElement('span');
      fileSize.className = 'clue-card__file-size';
      fileSize.textContent = card.fileSize;
      file.append(fileName, fileSize);
      element.append(description, file);
    } else {
      const description = document.createElement('p');
      description.className = 'clue-card__description';
      description.textContent = card.type === 'note' ? card.body : card.description;
      element.append(description);
    }

    const footer = document.createElement('div');
    footer.className = 'clue-card__source';
    const source = document.createElement('span');
    source.textContent = card.source;
    source.title = card.source;
    const scores = document.createElement('span');
    scores.className = 'clue-card__scores';
    [
      ['重要', card.importance],
      ['相关', card.relevance],
    ].forEach(([label, value]) => {
      const score = document.createElement('span');
      score.className = 'clue-card__score';
      score.textContent = `${label} ${value}`;
      scores.append(score);
    });
    footer.append(source, scores);
    element.append(footer);
    return element;
  }

  function queryVisibleCopies(left, top, right, bottom) {
    const periodWidth = clueWall.periodWidth;
    const periodHeight = clueWall.periodHeight;
    const firstTileX = Math.floor(left / periodWidth);
    const lastTileX = Math.floor((right - 0.001) / periodWidth);
    const firstTileY = Math.floor(top / periodHeight);
    const lastTileY = Math.floor((bottom - 0.001) / periodHeight);
    const candidates = new Map();

    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const localLeft = Math.max(0, left - tileX * periodWidth);
      const localRight = Math.min(periodWidth, right - tileX * periodWidth);
      if (localRight <= localLeft) continue;

      for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
        const localTop = Math.max(0, top - tileY * periodHeight);
        const localBottom = Math.min(periodHeight, bottom - tileY * periodHeight);
        if (localBottom <= localTop) continue;

        clueWall.query({
          left: localLeft,
          top: localTop,
          right: localRight,
          bottom: localBottom,
        }).forEach((card) => candidates.set(card.id, card));
      }
    }

    const copies = [];
    candidates.forEach((card) => {
      const minTileX = Math.floor(left / periodWidth) - 1;
      const maxTileX = Math.floor(right / periodWidth) + 1;
      const minTileY = Math.floor(top / periodHeight) - 1;
      const maxTileY = Math.floor(bottom / periodHeight) + 1;

      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const x = card.x + tileX * periodWidth;
        if (x + card.width <= left || x >= right) continue;

        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
          const y = card.y + tileY * periodHeight;
          if (y + card.height <= top || y >= bottom) continue;
          copies.push({ card, tileX, tileY, x, y });
        }
      }
    });

    return copies;
  }

  function updateCardAccessibility(copies) {
    const preferred = new Map();
    copies.forEach((copy) => {
      const centerX = copy.x + copy.card.width / 2;
      const centerY = copy.y + copy.card.height / 2;
      const distance = (centerX - cameraX) ** 2 + (centerY - cameraY) ** 2;
      const current = preferred.get(copy.card.id);
      if (!current || distance < current.distance) {
        preferred.set(copy.card.id, { key: `${copy.card.id}@${copy.tileX},${copy.tileY}`, distance });
      }
    });

    renderedCards.forEach((element) => {
      const id = element.dataset.cardId;
      const isPrimary = preferred.get(id)?.key === element.dataset.renderKey;
      if (isPrimary) {
        element.removeAttribute('aria-hidden');
        element.querySelectorAll('a').forEach((link) => link.removeAttribute('tabindex'));
      } else {
        element.setAttribute('aria-hidden', 'true');
        element.querySelectorAll('a').forEach((link) => link.setAttribute('tabindex', '-1'));
      }
    });
  }

  function renderVisibleCards(left, top, right, bottom) {
    const copies = queryVisibleCopies(left, top, right, bottom);
    const desiredCards = new Set();
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const snapPixel = (value) => Math.round(value * pixelRatio) / pixelRatio;

    copies.forEach(({ card, tileX, tileY, x, y }) => {
      const key = `${card.id}@${tileX},${tileY}`;
      desiredCards.add(key);
      let element = renderedCards.get(key);
      if (!element) {
        element = makeCardElement(card);
        element.dataset.renderKey = key;
        element.dataset.cardId = card.id;
        element.dataset.tileX = String(tileX);
        element.dataset.tileY = String(tileY);
        world.append(element);
        renderedCards.set(key, element);
      }

      const position = `${x},${y},${zoom}`;
      if (element.dataset.position !== position) {
        element.style.left = `${snapPixel(x * zoom)}px`;
        element.style.top = `${snapPixel(y * zoom)}px`;
        element.style.transformOrigin = '0 0';
        element.style.transform = `scale(${zoom})`;
        element.dataset.position = position;
      }
    });

    renderedCards.forEach((element, key) => {
      if (desiredCards.has(key)) return;
      element.remove();
      renderedCards.delete(key);
    });
    updateCardAccessibility(copies);
  }

  function renderScene(timestamp = performance.now()) {
    sceneFrame = 0;
    const elapsed = lastSceneTime ? Math.min(64, timestamp - lastSceneTime) : 16.7;
    lastSceneTime = timestamp;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const progress = prefersReducedMotion ? 1 : 1 - Math.exp(-elapsed / ZOOM_EASE_MS);
    zoom += (targetZoom - zoom) * progress;
    cameraX += (targetCameraX - cameraX) * progress;
    cameraY += (targetCameraY - cameraY) * progress;

    if (Math.abs(targetZoom - zoom) < 0.001) zoom = targetZoom;
    if (Math.abs(targetCameraX - cameraX) < 0.01) cameraX = targetCameraX;
    if (Math.abs(targetCameraY - cameraY) < 0.01) cameraY = targetCameraY;

    const cameraCycleX = Math.floor(cameraX / clueWall.periodWidth) * clueWall.periodWidth;
    const cameraCycleY = Math.floor(cameraY / clueWall.periodHeight) * clueWall.periodHeight;
    cameraX -= cameraCycleX;
    cameraY -= cameraCycleY;
    targetCameraX -= cameraCycleX;
    targetCameraY -= cameraCycleY;

    const translateX = plane.clientWidth / 2 - cameraX * zoom;
    const translateY = plane.clientHeight / 2 - cameraY * zoom;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const snapPixel = (value) => Math.round(value * pixelRatio) / pixelRatio;
    world.style.transform = `translate3d(${snapPixel(translateX)}px, ${snapPixel(translateY)}px, 0)`;

    const gridSize = 40 * zoom;
    plane.style.setProperty('--space-grid-size', `${gridSize}px`);
    plane.style.setProperty('--space-grid-x', `${cycle(snapPixel(translateX), gridSize)}px`);
    plane.style.setProperty('--space-grid-y', `${cycle(snapPixel(translateY), gridSize)}px`);
    if (zoomReadout) zoomReadout.value = `${Math.round(zoom * 100)}%`;

    const margin = OVERSCAN_PX / zoom;
    const halfWidth = plane.clientWidth / (2 * zoom);
    const halfHeight = plane.clientHeight / (2 * zoom);
    renderVisibleCards(
      cameraX - halfWidth - margin,
      cameraY - halfHeight - margin,
      cameraX + halfWidth + margin,
      cameraY + halfHeight + margin,
    );

    if (
      Math.abs(targetZoom - zoom) >= 0.001 ||
      Math.abs(targetCameraX - cameraX) >= 0.01 ||
      Math.abs(targetCameraY - cameraY) >= 0.01
    ) {
      scheduleSceneUpdate();
    }
  }

  function scheduleSceneUpdate() {
    if (sceneFrame) return;
    sceneFrame = window.requestAnimationFrame(renderScene);
  }

  function zoomAt(nextZoom, clientX = plane.clientWidth / 2, clientY = plane.clientHeight / 2) {
    const bounds = plane.getBoundingClientRect();
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const worldX = targetCameraX + (localX - plane.clientWidth / 2) / targetZoom;
    const worldY = targetCameraY + (localY - plane.clientHeight / 2) / targetZoom;
    targetZoom = clampZoom(nextZoom);
    targetCameraX = worldX - (localX - plane.clientWidth / 2) / targetZoom;
    targetCameraY = worldY - (localY - plane.clientHeight / 2) / targetZoom;
    scheduleSceneUpdate();
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    canvas.width = Math.round(canvasWidth * ratio);
    canvas.height = Math.round(canvasHeight * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    zoom = clampZoom(zoom);
    targetZoom = clampZoom(targetZoom);
    scheduleSceneUpdate();

    if (mode === 'active') drawReticle();
  }

  function createParticles() {
    const scale = Math.min(1.5, Math.max(0.65, Math.sqrt((canvasWidth * canvasHeight) / (1440 * 900))));
    const count = Math.min(8000, Math.round(PARTICLE_COUNT * scale));
    particles = Array.from({ length: count }, () => {
      const x = Math.random();
      const y = Math.random();
      const dx = (x - 0.5) * 2;
      const dy = (y - 0.5) * 2;
      const horizontal = Math.random() < 0.5;
      const armPosition = (Math.random() - 0.5) * 22;
      return {
        x,
        y,
        delay: Math.random() * 820,
        stagger: Math.random() * 24,
        survives: Math.random() < 0.2,
        removeAt: 0.2 + Math.random() * 0.55,
        size: 0.9 + Math.random() * 1.1,
        opacity: 0.18 + Math.random() * 0.22,
        distance: Math.min(1, Math.hypot(dx, dy) / Math.SQRT2),
        targetX: 0.5 + (horizontal ? armPosition / Math.max(canvasWidth, 1) : 0),
        targetY: 0.5 + (horizontal ? 0 : armPosition / Math.max(canvasHeight, 1)),
      };
    });
  }

  function drawReticle() {
    if (!context) return;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = 'rgb(105 105 105 / 0.55)';
    context.fillRect(canvasWidth / 2 - 9, canvasHeight / 2 - 0.7, 18, 1.4);
    context.fillRect(canvasWidth / 2 - 0.7, canvasHeight / 2 - 9, 1.4, 18);
  }

  function drawEntryFrame(now) {
    if (!context || mode !== 'entering') return;

    const elapsed = Math.min(now - animationStart, ENTRY_MS);
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const contractionProgress = Math.max(0, Math.min(1, (elapsed - APPEAR_MS) / MOTION_MS));

    particles.forEach((particle) => {
      const appearance = Math.max(0, Math.min(1, (elapsed - particle.delay) / 70));
      if (appearance === 0) return;

      let x = particle.x * canvasWidth;
      let y = particle.y * canvasHeight;
      let alpha = appearance * particle.opacity;

      if (elapsed > APPEAR_MS) {
        const start = APPEAR_MS + particle.distance * (RADIAL_STAGGER_MS - 24) + particle.stagger;
        const progress = Math.max(0, Math.min(1, (elapsed - start) / (ENTRY_MS - start)));
        const eased = progress * progress;
        x += (particle.targetX * canvasWidth - x) * eased;
        y += (particle.targetY * canvasHeight - y) * eased;

        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const crossDistance = Math.min(
          Math.abs(y - centerY) + Math.max(0, Math.abs(x - centerX) - 12),
          Math.abs(x - centerX) + Math.max(0, Math.abs(y - centerY) - 12),
        );
        const maskWidth = 1.5 + (1 - contractionProgress) * Math.hypot(canvasWidth, canvasHeight) * 0.8;
        const maskSoftness = Math.max(1.5, maskWidth * 0.08);
        const maskAlpha = Math.max(0, Math.min(1, (maskWidth - crossDistance) / maskSoftness));
        alpha *= maskAlpha;

        if (!particle.survives) {
          const dissolve = Math.max(0, Math.min(1, (progress - particle.removeAt) / 0.12));
          if (dissolve === 1) return;
          alpha *= 1 - dissolve;
        } else {
          alpha *= 1 - eased * 0.25;
        }
      }

      if (alpha < 0.005) return;
      context.globalAlpha = alpha;
      context.fillStyle = '#777';
      context.fillRect(Math.round(x), Math.round(y), particle.size, particle.size);
    });

    context.globalAlpha = 1;
    if (elapsed < ENTRY_MS) {
      animationFrame = window.requestAnimationFrame(drawEntryFrame);
    } else {
      animationFrame = 0;
    }
  }

  function clearEffect() {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    particles = [];
    context?.clearRect(0, 0, canvasWidth, canvasHeight);
  }

  function releasePointerLock() {
    if (document.pointerLockElement === plane) document.exitPointerLock();
  }

  function cancelEntry(message) {
    if (document.pointerLockElement === plane) lockPending = false;
    lockAcquired = false;
    lockFailed = false;
    clearAltPress();
    clearEffect();
    setMode('idle');
    releasePointerLock();
    if (message) showStatus(message);
  }

  function finishExit() {
    lockPending = false;
    lockAcquired = false;
    lockFailed = false;
    clearEffect();
    setMode('idle');
    releasePointerLock();
  }

  function beginEntry() {
    if (lockPending) {
      showStatus('鼠标锁定请求仍在结束，请稍后再试。');
      return false;
    }
    if (!context) {
      showStatus('当前浏览器无法绘制接管动画。');
      return false;
    }
    if (typeof plane.requestPointerLock !== 'function') {
      showStatus('当前浏览器不支持鼠标接管。');
      return false;
    }

    setMode('entering');
    animationStart = performance.now();
    createParticles();
    drawEntryFrame(animationStart);
    lockPending = false;
    lockAcquired = false;
    lockFailed = false;

    if (typeof plane.requestPointerLock !== 'function') {
      lockFailed = true;
      return true;
    }

    lockPending = true;
    try {
      const request = plane.requestPointerLock();
      if (request && typeof request.catch === 'function') {
        request.catch(() => {
          lockPending = false;
          if (mode === 'entering') lockFailed = true;
        });
      }
    } catch {
      lockPending = false;
      lockFailed = true;
    }
    return true;
  }

  function completeLongPress() {
    if (!altPress) return;
    altPress.triggered = true;

    if (altPress.action === 'exit') {
      finishExit();
      return;
    }

    if (mode !== 'entering' || lockFailed || !lockAcquired || document.pointerLockElement !== plane) {
      cancelEntry('浏览器未允许鼠标接管，请在页面内重试。');
      return;
    }

    setMode('active');
    drawReticle();
  }

  function clearAltPress() {
    if (!altPress) return;
    window.clearTimeout(altPress.timer);
    altPress = null;
  }

  restoreSettings();
  resizeCanvas();
  renderScene();
  if (clueWall.getStorageWarning()) showStatus(clueWall.getStorageWarning());

  /*
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || mode !== 'idle') return;
    if (!(event.target instanceof Element) || event.target.closest('[data-fixed-ui]')) return;
    if (event.target.closest('a, button, input, textarea, select')) return;

    const cardElement = event.target.closest('.clue-card');
    drag = {
      kind: cardElement ? 'card' : 'pan',
      cardId: cardElement?.dataset.cardId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    document.body.classList.toggle('is-space-dragging', drag.kind === 'pan');
    document.body.classList.toggle('is-clue-card-dragging', drag.kind === 'card');
    plane.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  */

  document.addEventListener('pointermove', (event) => {
    /*
    if (drag && drag.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.kind === 'card') {
        const card = clueWall.cards.find((item) => item.id === drag.cardId);
        if (card) clueWall.moveCard(card.id, card.x + deltaX / zoom, card.y + deltaY / zoom);
      } else {
        cameraX -= deltaX / zoom;
        cameraY -= deltaY / zoom;
      }
      scheduleSceneUpdate();
      return;
    }
    */

    if (mode === 'active' && document.pointerLockElement === plane) {
      cameraX -= event.movementX / zoom;
      cameraY -= event.movementY / zoom;
      targetCameraX = cameraX;
      targetCameraY = cameraY;
      scheduleSceneUpdate();
    }
  });

  /*
  const stopDragging = (event) => {
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    const finishedDrag = drag;
    drag = null;
    document.body.classList.remove('is-space-dragging');
    document.body.classList.remove('is-clue-card-dragging');
    if (finishedDrag.kind === 'card' && !clueWall.savePositions()) {
      showStatus(clueWall.getStorageWarning());
    }
    if (plane.hasPointerCapture(finishedDrag.pointerId)) {
      plane.releasePointerCapture(finishedDrag.pointerId);
    }
  };
  document.addEventListener('pointerup', stopDragging);
  document.addEventListener('pointercancel', stopDragging);
  window.addEventListener('blur', () => stopDragging());
  */

  document.addEventListener('wheel', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-fixed-ui]')) return;
    event.preventDefault();
    const deltaY = event.deltaMode === 1
      ? event.deltaY * 16
      : event.deltaMode === 2
        ? event.deltaY * plane.clientHeight
        : event.deltaY;
    zoomAt(
      targetZoom * Math.exp(-deltaY * BASE_WHEEL_SENSITIVITY * wheelZoomSensitivity),
      event.clientX,
      event.clientY,
    );
  }, { passive: false });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const settingsTrigger = event.target.closest('[data-open-settings]');
    if (settingsTrigger) {
      event.preventDefault();
      if (!settingsDialog || typeof settingsDialog.showModal !== 'function') {
        showStatus('当前浏览器不支持设置窗口。');
      } else if (!settingsDialog.open) {
        settingsDialog.showModal();
      }
      return;
    }

    const zoomButton = event.target.closest('[data-space-zoom]');
    if (!zoomButton) return;

    event.preventDefault();
    if (zoomButton.dataset.spaceZoom === 'reset') {
      targetZoom = clampZoom(1);
      targetCameraX = clueWall.periodWidth / 2;
      targetCameraY = clueWall.periodHeight / 2;
      scheduleSceneUpdate();
    } else {
      zoomAt(targetZoom * (zoomButton.dataset.spaceZoom === 'in' ? 1.2 : 1 / 1.2));
    }
  });

  sensitivitySlider?.addEventListener('input', () => {
    const value = Number(sensitivitySlider.value);
    if (!Number.isFinite(value)) return;
    wheelZoomSensitivity = clamp(value, 0.5, 3);
    updateSensitivityControl();
  });
  sensitivitySlider?.addEventListener('change', saveSettings);
  settingsDialog?.addEventListener('click', (event) => {
    if (event.target === settingsDialog) settingsDialog.close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mode !== 'idle') {
      event.preventDefault();
      clearAltPress();
      if (mode === 'entering') cancelEntry();
      else finishExit();
      return;
    }

    if (event.key !== 'Alt' || event.repeat || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (altPress) return;

    if (mode === 'idle') {
      if (!beginEntry()) return;
      altPress = { action: 'enter', triggered: false, timer: 0 };
    } else if (mode === 'active') {
      altPress = { action: 'exit', triggered: false, timer: 0 };
    } else {
      return;
    }

    altPress.timer = window.setTimeout(completeLongPress, ENTRY_MS);
  });

  document.addEventListener('keyup', (event) => {
    if (event.key !== 'Alt' || !altPress) return;
    const press = altPress;
    clearAltPress();
    if (press.action === 'enter' && !press.triggered && mode === 'entering') cancelEntry();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === plane) {
      if (mode !== 'entering' && mode !== 'active') {
        lockPending = false;
        releasePointerLock();
        return;
      }
      lockPending = false;
      lockAcquired = true;
      lockFailed = false;
      return;
    }

    lockPending = false;
    if (mode === 'entering') {
      lockAcquired = false;
      lockFailed = true;
    } else if (mode === 'active') {
      finishExit();
    }
  });

  document.addEventListener('pointerlockerror', () => {
    lockPending = false;
    if (mode === 'entering') lockFailed = true;
  });

  window.addEventListener('resize', resizeCanvas, { passive: true });
}
