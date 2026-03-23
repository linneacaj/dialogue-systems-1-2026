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
        alert("How to Play:\nYou're playing against the computer. You will each take turns thinking of a word. " +
            "The word you say must associate to the previous word that the computer said (the first thing that comes to mind is usually a good choice!)." +
            "The first person to take too long, names a word that doesn't fit, or gives up, loses the game. " +
            "\nThe chosen association can be max two words long. You get one point for each correct answer. " +
            "If you forfeit or take too long, your opponent automatically wins. In each round you are allowed to " +
            "challenge your opponent's answer by asking something along the line of \"what made you think of that?\"," +
            "\"can you explain that?\" or \"what is the association?\". You and your opponent then need to come to an " +
            "agreement on whether the association is valid or not. \n \n Good luck!");
    })
}


setupButtons(
    document.querySelector<HTMLButtonElement>("#start")!,
    document.querySelector<HTMLButtonElement>("#stop")!,
    document.querySelector<HTMLButtonElement>("#restart")!,
);
