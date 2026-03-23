import "./style.css";
import { setupButtons } from "./dm.ts";
import { createIcons, Info } from "lucide";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <div id="info-div">
        <button id="info-button" >
            <i data-lucide="info"></i>
        </button>
    </div>
    <div id="status">Welcome to the Word Association Game!</div>
    <div class="card">
      <button id="start">START</button>
      <button id="stop">STOP</button>
      <button id="restart">RESTART</button>
    </div>
      <div id="scoreboard">
        <h2>Points</h2>
        <div class="scoreboard-outer">
            <div class="scoreboard-inner">
                <p>Player 1</p>
                <p id="pt_user" class="score-value">0</p>
            </div>
            <div class="scoreboard-inner">
                <p>Computer</p>
                <p id="pt_machine" class="score-value">0</p>
            </div>
         </div>
        </div>
    </div>
</div>
`;

// import info icon so I don't have to manually design it
// docs: https://lucide.dev/icons/info
createIcons({ icons: {Info}});

const infoButton = document.querySelector<HTMLButtonElement>("#info-button");

if (infoButton) {
    infoButton.addEventListener("click", () => {
        alert("How to Play:\n\n [update later]");
    })
}


setupButtons(
    document.querySelector<HTMLButtonElement>("#start")!,
    document.querySelector<HTMLButtonElement>("#stop")!,
    document.querySelector<HTMLButtonElement>("#restart")!,
);
