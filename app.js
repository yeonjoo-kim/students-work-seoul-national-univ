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
