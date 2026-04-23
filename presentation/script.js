const slides = Array.from(document.querySelectorAll(".slide"));
const current = document.getElementById("current");
const total = document.getElementById("total");

const kanbanSteps = [
  {
    label: "Request",
    text: "사용자가 처리할 작업을 등록합니다.",
    left: "0.5%",
    width: "15.7%",
  },
  {
    label: "Plan",
    text: "AI가 요청을 분석하고 workflow를 생성합니다.",
    left: "16.9%",
    width: "15.7%",
  },
  {
    label: "Dev",
    text: "workflow 기반으로 코드 작성과 수정이 진행됩니다.",
    left: "33.7%",
    width: "15.7%",
  },
  {
    label: "Test",
    text: "실행 결과, 로그, 캡처, 검증 결과를 확인합니다.",
    left: "50.5%",
    width: "15.7%",
  },
  {
    label: "Done",
    text: "변경 파일, 검증 결과, 요약을 정리합니다.",
    left: "67.1%",
    width: "15.7%",
  },
];

let index = 0;
let revealStep = 0;

document.querySelectorAll(".photo-card").forEach((card) => {
  const caption = card.querySelector("figcaption");
  const img = card.querySelector("img");

  if (caption) {
    card.dataset.fallback = caption.textContent || "Conference";
  }

  if (img) {
    img.addEventListener("error", () => {
      card.classList.add("missing");
    });
  }
});

function maxRevealStep(slide) {
  if (slide?.hasAttribute("data-kanban-reveal")) {
    return kanbanSteps.length - 1;
  }

  if (slide?.hasAttribute("data-reveal")) {
    return 2;
  }

  return 0;
}

function updateKanbanSlide(slide, isActive) {
  if (!slide?.hasAttribute("data-kanban-reveal")) return;

  const step = kanbanSteps[Math.min(revealStep, kanbanSteps.length - 1)];
  const frame = slide.querySelector(".kanban-frame");
  const label = slide.querySelector(".kanban-stage-label");
  const caption = slide.querySelector(".kanban-caption p");

  if (frame && isActive) {
    frame.style.setProperty("--highlight-left", step.left);
    frame.style.setProperty("--highlight-width", step.width);
  }

  if (label && isActive) {
    label.textContent = step.label;
  }

  if (caption && isActive) {
    caption.textContent = step.text;
  }
}

function render() {
  slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === index;

    slide.classList.toggle("active", isActive);
    slide.classList.toggle("reveal-question", isActive && revealStep >= 1);
    slide.classList.toggle("reveal-detail", isActive && revealStep >= 2);
    updateKanbanSlide(slide, isActive);
  });

  current.textContent = String(index + 1);
  total.textContent = String(slides.length);
}

function move(delta) {
  const activeSlide = slides[index];
  const maxStep = maxRevealStep(activeSlide);

  if (delta > 0 && revealStep < maxStep) {
    revealStep += 1;
    render();
    return;
  }

  if (delta < 0 && maxStep > 0 && revealStep > 0) {
    revealStep -= 1;
    render();
    return;
  }

  index = Math.max(0, Math.min(slides.length - 1, index + delta));
  revealStep = 0;
  render();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
    event.preventDefault();
    move(1);
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    move(-1);
  }

  if (event.key === "Home") {
    event.preventDefault();
    index = 0;
    revealStep = 0;
    render();
  }

  if (event.key === "End") {
    event.preventDefault();
    index = slides.length - 1;
    revealStep = 0;
    render();
  }
});

render();
