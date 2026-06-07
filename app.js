// 1. Sanity 연결 및 쿼리 설정
const SANITY_PROJECT_ID = '60ak5087';
const SANITY_DATASET = 'production';
const SANITY_API_VERSION = '2026-06-07';
const HOME_TILE_COUNT = 50;

const query = `*[_type == "event"] | order(number asc) {
  _id,
  number,
  title,
  "coverImageUrl": coverImage.asset->url,
  "identityImageUrls": identityImages[].asset->url,
  works[]->{
    _id,
    title,
    artist,
    description,
    "coverImageUrl": coverImage.asset->url,
    "detailImageUrls": detailImages[].asset->url,
    orientation
  }
}`;

// 2. 상태 관리 변수
let data = {
  siteTitle: "Students' Work : Seoul National Univ",
  events: []
};
let dataLoadMessage = "";

let route = { name: "home", eventId: null };
let selectedWork = null;
let galleryIndex = 0;
let dragState = null;
let stackDragState = null;
let lastPointerStartAt = 0;
let installationZoom = 1;
let carriedWorkId = null;
let lastCursorPoint = { x: 45, y: 58 };
const placementState = new Map();
let homeTileLayout = [];

// 4. DOM 요소 선택
const app = document.querySelector("#app");
const view = document.querySelector("#view");
const dialog = document.querySelector("[data-work-dialog]");

// 5. 이벤트 리스너 등록
document.addEventListener("click", handleGlobalClick);
dialog.addEventListener("close", () => {
  selectedWork = null;
  galleryIndex = 0;
});

// 6. 초기화: Sanity에서 데이터 불러오기
async function init() {
  const encodedQuery = encodeURIComponent(query);
  const urls = [
    `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodedQuery}`,
    `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodedQuery}`
  ];

  for (const url of urls) {
    try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    
    if (result && result.result) {
      data.events = result.result.map(event => normalizeSanityEvent(event));
      if (data.events.length) {
        dataLoadMessage = "";
        homeTileLayout = createRandomHomeLayout(getHomeTileCount());
        render();
        return;
      }
      dataLoadMessage = "Sanity에 공개된 Event가 없습니다. Event 문서가 Published 상태인지 확인해주세요.";
    }
  } catch (error) {
    dataLoadMessage = `Sanity 데이터 로드 실패: ${error.message || error}`;
    console.error("Sanity 데이터 로드 실패:", error);
  }
  }

  data.events = [];
  homeTileLayout = createRandomHomeLayout(getHomeTileCount());
  dataLoadMessage = dataLoadMessage
    ? `${dataLoadMessage} 빈 사각형만 표시합니다.`
    : "Sanity 데이터를 불러오지 못해 빈 사각형만 표시합니다.";
  render();
}

function normalizeSanityEvent(event) {
  return {
        // 🔥 수정된 부분: 숫자를 문자로 강제 변환하고 빈자리를 0으로 채움 (예: 1 -> "01")
        id: String(event.number).padStart(2, '0'), 
        title: event.title,
        cover: event.coverImageUrl,
        identityImages: event.identityImageUrls || [],
        works: (event.works || []).map(work => ({
          id: String(work._id), // ID를 안전하게 문자로 변환
          title: work.title,
          artist: work.artist || '',
          description: work.description || '',
          cover: work.coverImageUrl,
          orientation: work.orientation || 'portrait',
          details: work.detailImageUrls || []
        }))
      };
}

init();

// ==========================================
// 이하 화면 렌더링 및 인터랙션 로직
// ==========================================

function render() {
  document.querySelector("[data-site-title]").textContent = route.name === "home"
    ? data.siteTitle
    : getEvent(route.eventId)?.title || data.siteTitle;
  app.classList.toggle("has-back", route.name !== "home");

  if (route.name === "home") renderHome();
  if (route.name === "event") renderEvent();
  if (route.name === "installation") renderInstallation();
}

function renderHome() {
  if (homeTileLayout.length !== getHomeTileCount()) {
    homeTileLayout = createRandomHomeLayout(getHomeTileCount());
  }

  view.innerHTML = `
    <section class="screen-shell home-view">
      <div class="figma-frame home-frame">
        <h2 class="home-title">${data.siteTitle}</h2>
        ${dataLoadMessage ? `<p class="home-status">${dataLoadMessage}</p>` : ""}
        <nav class="event-index" aria-label="행사 목록">
          <div class="event-map">
            ${homeTileLayout.map((tile, index) => renderHomeTile(tile, data.events[index])).join("")}
          </div>
        </nav>
      </div>
    </section>
  `;
}

function renderHomeTile(tile, event) {
  const style = `left:${tile.x}%; top:${tile.y}%; --table-long:${tile.long}%; --table-short:${tile.short}%;`;
  const orientation = tile.orientation;
  if (!event) {
    return `<span class="event-number event-number-empty" data-orientation="${orientation}" style="${style}" aria-hidden="true"></span>`;
  }

  return `
    <button
      class="event-number"
      type="button"
      data-action="open-event"
      data-event-id="${event.id}"
      data-orientation="${orientation}"
      style="${style}"
    >
      ${event.id}
    </button>
  `;
}

function getHomeTileCount() {
  return Math.max(HOME_TILE_COUNT, data.events.length);
}

function createRandomHomeLayout(count) {
  const templates = [
    [[2, 1], [7, 1], [7, 5], [12, 5], [12, 8], [6, 8], [6, 12], [1, 12], [1, 6], [4, 6], [4, 3], [1, 3], [1, 1]],
    [[1, 2], [6, 2], [6, 1], [10, 1], [10, 4], [12, 4], [12, 7], [8, 7], [8, 10], [12, 10], [12, 12], [5, 12], [5, 9], [2, 9], [2, 5], [4, 5], [4, 3]],
    [[2, 12], [8, 12], [8, 9], [11, 9], [11, 6], [7, 6], [7, 3], [12, 3], [12, 1], [4, 1], [4, 5], [1, 5], [1, 10], [3, 10], [3, 12]]
  ];
  const tiles = chain(templates[randomInt(0, templates.length - 1)], count);

  return normalizeHomeTiles(transformHomeTemplate(tiles)).slice(0, count);
}

function transformHomeTemplate(tiles) {
  const xs = tiles.map(tile => tile.x);
  const ys = tiles.map(tile => tile.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const mirrorX = Math.random() > 0.5;
  const mirrorY = Math.random() > 0.5;

  return tiles.map(tile => ({
    x: mirrorX ? minX + maxX - tile.x : tile.x,
    y: mirrorY ? minY + maxY - tile.y : tile.y,
    orientation: tile.orientation
  }));
}

const HOME_TILE_LONG = 1;
const HOME_TILE_SHORT = 0.4;
const HOME_TILE_GAP = 0.32;

function chain(points, minCount) {
  const moves = createMoves(points);
  const extension = createMoves([[0, 0], [4, 0], [4, 3], [1, 3], [1, 6], [6, 6], [6, 8], [2, 8], [2, 10], [7, 10]]);

  while (moves.length + 1 < minCount) {
    moves.push(...extension);
  }

  return movesToTiles(moves).slice(0, minCount);
}

function createMoves(points) {
  const moves = [];

  for (let index = 1; index < points.length; index += 1) {
    const [startX, startY] = points[index - 1];
    const [endX, endY] = points[index];
    const dx = Math.sign(endX - startX);
    const dy = Math.sign(endY - startY);
    const length = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));

    for (let step = 0; step < length; step += 1) {
      moves.push({ x: dx, y: dy });
    }
  }

  return moves;
}

function movesToTiles(moves) {
  const tiles = [];
  if (!moves.length) return tiles;

  let x = 0;
  let y = 0;
  let previousMove = moves[0];
  tiles.push({ x, y, orientation: moveOrientation(previousMove) });

  for (const move of moves) {
    const delta = getTileDelta(previousMove, move);
    x += delta.x;
    y += delta.y;
    tiles.push({ x, y, orientation: moveOrientation(move) });
    previousMove = move;
  }

  return tiles;
}

function getTileDelta(previousMove, move) {
  const sameAxis = moveOrientation(previousMove) === moveOrientation(move);
  if (sameAxis) {
    return {
      x: move.x * (HOME_TILE_LONG + HOME_TILE_GAP),
      y: move.y * (HOME_TILE_LONG + HOME_TILE_GAP)
    };
  }

  return {
    x: previousMove.x
      ? previousMove.x * (HOME_TILE_LONG / 2 + HOME_TILE_GAP + HOME_TILE_SHORT / 2)
      : move.x * (HOME_TILE_SHORT / 2 + HOME_TILE_GAP + HOME_TILE_LONG / 2),
    y: previousMove.y
      ? previousMove.y * (HOME_TILE_LONG / 2 + HOME_TILE_GAP + HOME_TILE_SHORT / 2)
      : move.y * (HOME_TILE_SHORT / 2 + HOME_TILE_GAP + HOME_TILE_LONG / 2)
  };
}

function moveOrientation(move) {
  return move.x === 0 ? "vertical" : "horizontal";
}

function normalizeHomeTiles(tiles) {
  const bounds = tiles.reduce((result, tile) => {
    const halfWidth = tile.orientation === "horizontal" ? HOME_TILE_LONG / 2 : HOME_TILE_SHORT / 2;
    const halfHeight = tile.orientation === "horizontal" ? HOME_TILE_SHORT / 2 : HOME_TILE_LONG / 2;
    return {
      minX: Math.min(result.minX, tile.x - halfWidth),
      maxX: Math.max(result.maxX, tile.x + halfWidth),
      minY: Math.min(result.minY, tile.y - halfHeight),
      maxY: Math.max(result.maxY, tile.y + halfHeight)
    };
  }, {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  });

  bounds.minX -= HOME_TILE_GAP;
  bounds.maxX += HOME_TILE_GAP;
  bounds.minY -= HOME_TILE_GAP;
  bounds.maxY += HOME_TILE_GAP;

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = 90 / Math.max(width, height);
  const offsetX = (100 - width * scale) / 2;
  const offsetY = (100 - height * scale) / 2;

  return tiles.map(tile => {
    return {
      x: offsetX + (tile.x - bounds.minX) * scale,
      y: offsetY + (tile.y - bounds.minY) * scale,
      long: HOME_TILE_LONG * scale,
      short: HOME_TILE_SHORT * scale,
      orientation: tile.orientation
    };
  });
}

function line(startX, startY, endX, endY) {
  const tiles = [];
  const dx = Math.sign(endX - startX);
  const dy = Math.sign(endY - startY);
  const length = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
  const orientation = dx === 0 ? "vertical" : "horizontal";

  for (let index = 0; index <= length; index += 1) {
    tiles.push({ x: startX + dx * index, y: startY + dy * index, orientation });
  }

  return tiles;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function gridToPct(value, total, minPct, maxPct) {
  return minPct + (value / (total - 1)) * (maxPct - minPct);
}


function renderEvent() {
  const event = getEvent(route.eventId);
  if (!event) {
    route = { name: "home", eventId: null };
    render();
    return;
  }

  view.innerHTML = `
    <section class="screen-shell event-view">
      <div class="figma-frame event-frame">
        <button class="figma-home-link" type="button" data-action="back" aria-label="뒤로 가기">
          <img src="./assets/exit-icon.svg" alt="">
        </button>
        <h2 class="figma-event-title">${event.title}</h2>
        <button class="figma-stack stack-center" type="button" data-action="open-installation" data-orientation="${getBundleOrientation(event)}" aria-label="${event.title} 작품 묶음 열기">
          ${renderBundleSheets(event, 8, "center")}
        </button>
      </div>
    </section>
  `;
}

function renderInstallation() {
  const event = getEvent(route.eventId);
  if (!event) return;
  const placements = getPlacements(event.id);
  const placedIds = new Set(placements.keys());
  const remainingWorks = event.works.filter((work) => !placedIds.has(work.id));
  const previewWork = getCursorWork(event, remainingWorks);
  const stackWorks = previewWork
    ? remainingWorks.filter((work) => work.id !== previewWork.id)
    : remainingWorks;

  view.innerHTML = `
    <section class="screen-shell installation-view">
      <div class="figma-frame installation-frame">
        <button class="figma-back" type="button" data-action="back" aria-label="뒤로 가기">
          <img src="./assets/curved-back-icon.svg" alt="">
        </button>
        <h2 class="figma-event-title">${event.title}</h2>
        <div class="zoom-controls" aria-label="화면 확대 축소">
          <button type="button" data-action="zoom-out" aria-label="축소">-</button>
          <button class="zoom-value" type="button" data-action="zoom-reset" aria-label="확대 비율 초기화">${Math.round(installationZoom * 100)}%</button>
          <button type="button" data-action="zoom-in" aria-label="확대">+</button>
        </div>
        <div class="identity-layer">
          ${renderIdentity(event)}
        </div>
        <div class="zoom-layer book-zoom-layer" style="--scene-zoom:${installationZoom};">
          <div class="floating-stack" data-floating-stack>
            ${event.works.filter((work) => placedIds.has(work.id)).map((work) => renderDeskCard(work, placements.get(work.id))).join("")}
          </div>
          ${previewWork ? renderCursorCard(previewWork) : ""}
          ${stackWorks.length ? `
            <button class="figma-stack stack-left" type="button" data-action="place-next" data-next-work-id="${stackWorks[0].id}" data-orientation="${getBundleOrientation({ ...event, works: stackWorks })}" aria-label="다음 작품 배치하기">
              ${renderBundleSheets({ ...event, works: stackWorks }, 8, "left")}
            </button>
          ` : ""}
        </div>
      </div>
    </section>
  `;

  const frame = view.querySelector(".installation-frame");
  frame.addEventListener("pointermove", moveCursorPreview);
  frame.addEventListener("mousemove", moveCursorPreview);
  frame.addEventListener("click", handleInstallationClick);
  view.querySelectorAll(".desk-card").forEach((card) => {
    card.addEventListener("pointerdown", startDragCard);
    card.addEventListener("mousedown", startDragCard);
  });
  const stack = view.querySelector(".stack-left");
  if (stack) {
    stack.addEventListener("pointerdown", startStackDrag);
    stack.addEventListener("mousedown", startStackDrag);
  }
}

function renderBundleSheets(event, visibleCount) {
  const works = event.works.length ? event.works : [{ cover: event.cover, title: event.title }];
  const count = Math.min(Math.max(works.length, 1), visibleCount);
  const coverWork = works[0];
  return Array.from({ length: count }, (_, index) => {
    const work = works[index % works.length];
    const depth = count - index - 1;
    const offset = toPct(depth * 17, 412);
    const image = (index === count - 1 ? coverWork.cover : work.cover) || event.cover;
    const stateClass = index === count - 1 ? "has-cover" : "is-blank";
    return `
      <span class="bundle-sheet ${stateClass}" style="--offset:${offset}%; z-index:${index + 1}">
        ${index === count - 1 ? `<img src="${image}" alt="">` : ""}
      </span>
    `;
  }).join("");
}

function getBundleOrientation(event) {
  return event.works[0]?.orientation || "portrait";
}

function renderIdentity(event) {
  if (!event.identityImages.length) return "";
  const primary = event.identityImages[0];
  return `<img class="identity-backdrop" src="${primary}" alt="">`;
}

function renderDeskCard(work, placement) {
  const x = placement?.x ?? 50;
  const y = placement?.y ?? 50;
  return `
    <button
      class="desk-card"
      type="button"
      data-action="open-work"
      data-work-id="${work.id}"
      data-orientation="${work.orientation || "portrait"}"
      style="left:${x}%; top:${y}%;"
      aria-label="${work.title} 상세 보기"
    >
      <img src="${work.cover}" alt="">
    </button>
  `;
}

function renderCursorCard(work) {
  return `
    <div
      class="cursor-card"
      data-cursor-card
      data-orientation="${work.orientation || "portrait"}"
      style="left:${lastCursorPoint.x}%; top:${lastCursorPoint.y}%;"
      aria-hidden="true"
    >
      <img src="${work.cover}" alt="">
    </div>
  `;
}

function handleGlobalClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  if (action === "back") goBack();
  if (action === "open-event") {
    route = { name: "event", eventId: actionTarget.dataset.eventId };
    render();
  }
  if (action === "open-installation") {
    placementState.set(route.eventId, new Map());
    installationZoom = 1;
    carriedWorkId = null;
    lastCursorPoint = { x: 45, y: 58 };
    route = { name: "installation", eventId: route.eventId };
    render();
  }
  if (action === "place-next") {
    if (actionTarget.dataset.draggingStack === "true") return;
    const eventData = getEvent(route.eventId);
    if (!eventData) return;
    if (getCursorWork(eventData)) placeCursorWork(event);
    else pickNextWork(eventData, event);
  }
  if (action === "zoom-in") updateZoom(0.15);
  if (action === "zoom-out") updateZoom(-0.15);
  if (action === "zoom-reset") updateZoom(0, true);
  if (action === "close-dialog") dialog.close();
  if (action === "open-work") {
    if (actionTarget.dataset.suppressClick === "true" || dragState?.moved) return;
    const work = findWork(actionTarget.dataset.workId);
    if (work) openWorkDialog(work);
  }
  if (action === "gallery-prev") moveGallery(-1);
  if (action === "gallery-next") moveGallery(1);
}

function goBack() {
  if (route.name === "installation") route = { name: "event", eventId: route.eventId };
  else route = { name: "home", eventId: null };
  render();
}

function placeNextWork() {
  const event = getEvent(route.eventId);
  const placements = getPlacements(route.eventId);
  const work = event.works.find((item) => !placements.has(item.id));
  if (!work) return;

  const placedCount = placements.size;
  const positions = [
    [toPct(1277, 1920), toPct(658, 1080)],
    [toPct(894, 1920), toPct(658, 1080)],
    [toPct(511, 1920), toPct(658, 1080)],
    [toPct(1086, 1920), toPct(520, 1080)],
    [toPct(704, 1920), toPct(520, 1080)],
    [toPct(322, 1920), toPct(520, 1080)]
  ];
  const [x, y] = positions[placedCount % positions.length];
  placements.set(work.id, { x, y });
  renderInstallation();
}

function getCursorWork(event, remainingWorks = null) {
  const placements = getPlacements(event.id);
  const works = remainingWorks || event.works.filter((work) => !placements.has(work.id));
  if (!works.length) return null;
  if (carriedWorkId) {
    return works.find((work) => work.id === carriedWorkId) || null;
  }
  if (placements.size === 0) return works[0];
  return null;
}

function pickNextWork(event, sourceEvent = null) {
  const placements = getPlacements(event.id);
  const work = event.works.find((item) => !placements.has(item.id));
  if (!work) return;
  if (sourceEvent) lastCursorPoint = getScenePoint(sourceEvent);
  carriedWorkId = work.id;
  renderInstallation();
}

function placeCursorWork(event) {
  const eventData = getEvent(route.eventId);
  if (!eventData) return;
  const work = getCursorWork(eventData);
  if (!work) return;
  const point = getScenePoint(event);
  lastCursorPoint = point;
  getPlacements(eventData.id).set(work.id, point);
  carriedWorkId = null;
  renderInstallation();
}

function handleInstallationClick(event) {
  if (route.name !== "installation") return;
  if (dragState?.moved || stackDragState) return;
  if (event.target.closest(".desk-card, .zoom-controls, .figma-back, .figma-stack")) return;
  const eventData = getEvent(route.eventId);
  if (!eventData || !getCursorWork(eventData)) return;
  placeCursorWork(event);
}

function startStackDrag(event) {
  if (shouldIgnoreMouseFallback(event)) return;
  if (event.button !== 0 && event.pointerType !== "touch") return;
  const stack = event.currentTarget;
  const currentEvent = getEvent(route.eventId);
  const placements = getPlacements(route.eventId);
  const work = currentEvent?.works.find((item) => !placements.has(item.id));
  if (!work) return;

  stackDragState = {
    stack,
    work,
    startX: event.clientX,
    startY: event.clientY
  };
  if (event.type === "pointerdown") {
    try {
      stack.setPointerCapture(event.pointerId);
    } catch {}
    document.addEventListener("pointermove", moveStackDrag);
    document.addEventListener("pointerup", endStackDrag, { once: true });
  } else {
    document.addEventListener("mousemove", moveStackDrag);
    document.addEventListener("mouseup", endStackDrag, { once: true });
  }
}

function moveStackDrag(event) {
  if (!stackDragState) return;
  const distance = Math.abs(event.clientX - stackDragState.startX) + Math.abs(event.clientY - stackDragState.startY);
  if (distance < 8) return;

  const { stack, work } = stackDragState;
  stack.dataset.draggingStack = "true";
  window.setTimeout(() => {
    stack.dataset.draggingStack = "false";
  }, 280);
  try {
    stack.releasePointerCapture(event.pointerId);
  } catch {}
  document.removeEventListener("pointermove", moveStackDrag);
  document.removeEventListener("mousemove", moveStackDrag);
  const { x, y } = getScenePoint(event);
  lastCursorPoint = { x, y };
  getPlacements(route.eventId).set(work.id, { x, y });
  if (carriedWorkId === work.id || getPlacements(route.eventId).size === 1) carriedWorkId = null;
  renderInstallation();

  const card = view.querySelector(`[data-work-id="${work.id}"]`);
  if (!card) return;
  dragState = {
    card,
    work,
    startX: stackDragState.startX,
    startY: stackDragState.startY,
    moved: true,
    fromStack: true,
    offsetX: 0,
    offsetY: 0
  };
  document.addEventListener("pointermove", dragCard);
  document.addEventListener("mousemove", dragCard);
  document.addEventListener("pointerup", endDragCard, { once: true });
  document.addEventListener("mouseup", endDragCard, { once: true });
  dragCard(event);
  stackDragState = null;
}

function endStackDrag(event) {
  if (!stackDragState) return;
  if (event.type === "pointerup") {
    try {
      stackDragState.stack.releasePointerCapture(event.pointerId);
    } catch {}
  }
  document.removeEventListener("pointermove", moveStackDrag);
  document.removeEventListener("mousemove", moveStackDrag);
  stackDragState = null;
}

function startDragCard(event) {
  if (shouldIgnoreMouseFallback(event)) return;
  const card = event.currentTarget;
  const work = findWork(card.dataset.workId);
  if (!work) return;
  const pointer = getScenePoint(event);
  const placement = getPlacements(route.eventId).get(work.id) || pointer;

  dragState = {
    card,
    work,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    offsetX: pointer.x - placement.x,
    offsetY: pointer.y - placement.y
  };
  if (event.type === "pointerdown") {
    try {
      card.setPointerCapture(event.pointerId);
    } catch {}
    card.addEventListener("pointermove", dragCard);
    card.addEventListener("pointerup", endDragCard, { once: true });
    document.addEventListener("pointermove", dragCard);
    document.addEventListener("pointerup", endDragCard, { once: true });
  } else {
    document.addEventListener("mousemove", dragCard);
    document.addEventListener("mouseup", endDragCard, { once: true });
  }
}

function dragCard(event) {
  if (!dragState) return;
  const point = getScenePoint(event);
  const x = clamp(point.x - (dragState.offsetX || 0), 8, 92);
  const y = clamp(point.y - (dragState.offsetY || 0), 18, 88);
  getPlacements(route.eventId).set(dragState.work.id, { x, y });
  dragState.card.style.left = `${x}%`;
  dragState.card.style.top = `${y}%`;
  if (Math.abs(event.clientX - dragState.startX) + Math.abs(event.clientY - dragState.startY) > 8) {
    dragState.moved = true;
  }
}

function endDragCard(event) {
  if (!dragState) return;
  const shouldOpen = !dragState.moved && !dragState.fromStack;
  const clickedWork = shouldOpen ? dragState.work : null;
  dragState.card.dataset.suppressClick = "true";
  window.setTimeout(() => {
    dragState.card.dataset.suppressClick = "false";
  }, 220);
  try {
    dragState.card.releasePointerCapture(event.pointerId);
  } catch {}
  dragState.card.removeEventListener("pointermove", dragCard);
  document.removeEventListener("pointermove", dragCard);
  document.removeEventListener("mousemove", dragCard);
  window.setTimeout(() => {
    dragState = null;
  }, 0);
  if (clickedWork) openWorkDialog(clickedWork);
}

function getPlacements(eventId) {
  if (!placementState.has(eventId)) placementState.set(eventId, new Map());
  return placementState.get(eventId);
}

function getScenePoint(event) {
  const frame = view.querySelector(".figma-frame");
  const rect = frame.getBoundingClientRect();
  const screenX = ((event.clientX - rect.left) / rect.width) * 100;
  const screenY = ((event.clientY - rect.top) / rect.height) * 100;
  return {
    x: clamp(screenX, 8, 92),
    y: clamp(screenY, 18, 88)
  };
}

function moveCursorPreview(event) {
  if (dragState || stackDragState) return;
  const cursorCard = view.querySelector("[data-cursor-card]");
  if (!cursorCard) return;
  const { x, y } = getScenePoint(event);
  cursorCard.style.left = `${x}%`;
  cursorCard.style.top = `${y}%`;
}

function updateZoom(delta, reset = false) {
  installationZoom = reset ? 1 : clamp(Number((installationZoom + delta).toFixed(2)), 0.55, 1.8);
  if (route.name === "installation") renderInstallation();
}

function openWorkDialog(work) {
  const event = data.events.find((item) => item.works.some((candidate) => candidate.id === work.id));
  selectedWork = work;
  galleryIndex = 0;
  document.querySelector("[data-dialog-event]").textContent = event?.title || "";
  document.querySelector("[data-dialog-title]").textContent = work.title;
  document.querySelector("[data-dialog-artist]").textContent = work.artist || "";
  document.querySelector("[data-dialog-description]").textContent = work.description || "";
  renderGallery();
  dialog.showModal();
}

function renderGallery() {
  if (!selectedWork) return;
  const images = [selectedWork.cover, ...(selectedWork.details || [])].filter(Boolean);
  const image = images[galleryIndex] || selectedWork.cover;
  document.querySelector("[data-gallery]").innerHTML = `<img src="${image}" alt="${selectedWork.title}">`;
  document.querySelector("[data-gallery-count]").textContent = `${galleryIndex + 1} / ${images.length}`;
}

function moveGallery(direction) {
  if (!selectedWork) return;
  const images = [selectedWork.cover, ...(selectedWork.details || [])].filter(Boolean);
  galleryIndex = (galleryIndex + direction + images.length) % images.length;
  renderGallery();
}

// 7. 유틸리티 함수
// 🔥 수정된 부분: 행사나 작품을 찾을 때 글자(String)로 안전하게 비교하도록 수정
function getEvent(id) {
  return data.events.find((event) => String(event.id) === String(id));
}

function findWork(id) {
  for (const event of data.events) {
    const work = event.works.find((item) => String(item.id) === String(id));
    if (work) return work;
  }
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toPct(value, total) {
  return (value / total) * 100;
}

function shouldIgnoreMouseFallback(event) {
  if (event.type === "pointerdown") {
    lastPointerStartAt = Date.now();
    return false;
  }
  return event.type === "mousedown" && Date.now() - lastPointerStartAt < 400;
}
