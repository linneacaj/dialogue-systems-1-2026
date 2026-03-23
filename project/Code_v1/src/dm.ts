import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureLanguageCredentials = {
  endpoint: "https://appointment-gus2026-lang.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
  key: NLU_KEY /** reference to your Azure CLU key */,
  deploymentName: "final-project" /** your Azure CLU deployment */,
  projectName: "final-project-gus2026" /** your Azure CLU project name */,
};

const azureCredentials = {
  endpoint:
      "https://switzerlandnorth.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials /** global activation of NLU */,
  azureCredentials: azureCredentials,
  azureRegion: "switzerlandnorth",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-AvaNeural",
};

function getComputerWord(word: string, previous_words: string[]): { word: string, success: boolean } {
  /*
  This function generates a new word association based on the current word. It takes the current word and looks up whether
  there is a match in the dictionary. If there is a match, the function returns that match, if not, the function returns unsuccessful.

  :param word: the current word in the game
  :param previous_words: a list of all words previously said in this game (they cannot be repeated again)
  :return: a dictionary of the new word selected, and a boolean value indicating whether the function was able to generate a new word or not.
   */
  const associations: { [key: string]: string } = {
    "teacher": "whiteboard",
    "whiteboard": "marker",
    "marker": "art",
    "art": "museum",
    "museum": "history",
    "history": "old",
    "old": "grandparents",
    "grandparents": "family",
    "family": "love"
  };
  const result = associations[word.toLowerCase()];
  const failResponse = "I can't think of anything ... You win!"

  // check if the result has already been said
  if (previous_words.includes(result)) {
    return {word: failResponse, success: false};
  }

  return result ? {word:result, success:true} : {word: failResponse, success: false};
}


function getEntity(entities: any, category: string) {
  /*
  This function extracts and returns the specified entity from the NLU.
   */

  // if the category is name, check if there is a nickname in the entities
  if (category === "name") {
    const nickname = entities.find((e: any) => e.category === "nickname")?.text;
    if (nickname) return nickname;
  }

  // return the contents of the category
  return entities.find((e: any) => e.category === category)?.text;
}

const resetContext = {
  pt_machine: null,
  pt_user: null,
  current_word: null,
  association_found: null,
  name: null,
  lastResult: null,
  previous_words: [],
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
        context.spstRef.send({
          type: "SPEAK",
          value: {
            utterance: params.utterance,
          },
        }),
    "spst.listen": ({ context }) =>
        context.spstRef.send({
          type: "LISTEN",
        }),
    "spst.listen.nlu": ({ context }) =>
        context.spstRef.send({
          type: "LISTEN",
          value: { nlu: true } /** Local activation of NLU */,
        }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    pt_machine: null,
    pt_user: null,
    name: null,
    current_word: null,
    association_found: null,
    previous_words: [],
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Greeting" },
    },
    Greeting: {
      initial: "Prompt",
      on: {
        // allow stop from anywhere in the dialogue
        STOP: "#DM.Done",
        // restart = click action. Allow restart from anywhere in the dialogue
        CLICK: {
          // clear the context
          actions: assign(resetContext),
          target: "#DM.Greeting.Prompt",
        },
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello, let's play the category game!` } },
          on: { SPEAK_COMPLETE: "AskName" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "AskName" },
        },
        AskName: {
          entry: { type: "spst.speak", params: { utterance: `What's your name?` } },
          on: { SPEAK_COMPLETE: "NameResponse" },
        },
        StartGame: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Nice to meet you ${context.name}, let's start the game! You can go first, name a category.`
            })
          },
          on: { SPEAK_COMPLETE: "UserTurn" },
        },
        PlayerReady: {
          entry: { type: "spst.speak", params: { utterance: `Are you ready to play?` } },
          on: { SPEAK_COMPLETE: "PlayerReadyResponse" },
        },
        EndGameNotReady: {
          entry: { type: "spst.speak", params: { utterance: `You can click the info button to read the instructions. 
          Come back whenever you're ready and we can play again! Bye.` } },
          on: { SPEAK_COMPLETE: "#DM.Done" },
        },
        ExplainRules: {
          entry: { type: "spst.speak", params: { utterance: `We will take turns thinking of words associated to what the other player just said. If someone takes too long to respond, or say a word that is not related they lose.` } },
          on: { SPEAK_COMPLETE: "PlayerReady" },
        },
        NameResponse: {
          entry: { type: "spst.listen.nlu" },
          on: {
            RECOGNISED: [{
              // handle IntroduceName intent
              guard: ({event}) => {
                console.log("Full event: ", JSON.stringify(event, null, 2));
                return event.nluValue.topIntent === "IntroduceName";
              },
              actions: [
                assign(({ event }) => {
                  const nluValue = (event as any).nluValue;
                  const entities = nluValue.entities;
                  return {
                    lastResult: event.value,
                    name: getEntity( entities, "name"),
                  };
                }),
              ],
              target: "WaitForSpeechIdleAfterName"
            },
              {
                // handle HowToPlay intent
                guard: ({ event}) => (event as any).nluValue?.topIntent === "AskForInstructions",
                actions: assign(({ event}) => {
                  const entities = (event as any).nluValue?.entities ?? [];
                  const extractedName = getEntity(entities, "name") ?? null;
                  return {
                    lastResult: event.value,
                    name: extractedName,
                  };
                }) ,
                target: "WaitForExplainRules"
              },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForNameReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForNameReprompt"
            },
          },
        },
        NameReprompt: {
          entry: { type: "spst.speak", params: { utterance: `Sorry, I didn't understand that. What's your name?` } },
          on: { SPEAK_COMPLETE: "NameResponse" },
        },
        WaitForUserTurnReprompt: {
          on: {
            LISTEN_COMPLETE: "UserTurnReprompt"
          }
        },
        UserTurnReprompt: {
          entry: { type: "spst.speak", params: { utterance: `Sorry, I didn't understand that. Please say a category.` } },
          on: { SPEAK_COMPLETE: "UserTurn" },
        },
        WaitForNameReprompt: {
          on: {
            LISTEN_COMPLETE: "NameReprompt"
          }
        },
        PlayerReadyResponse: {
          entry: { type: "spst.listen.nlu" },
          on: {
            RECOGNISED: [{
              // check if the person responded yes
              guard: ({event}) => ( event as any).nluValue?.topIntent === "Agree",
              target: "WaitForSpeechIdleAfterPlayerReady"
            },
              {
                // check if the person responded no
                guard: ({event}) => ( event as any).nluValue?.topIntent === "Disagree",
                target: "WaitForEndGameNotReady"
              },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForPlayerReadyReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForPlayerReadyReprompt"
            },
          },
        },
        UserTurn: {
          entry: { type: "spst.listen.nlu"},
          on: {
            RECOGNISED: [
              {
                // end game check
                guard: ({ event }) => (event as any).nluValue?.topIntent === "StopGame",
                target: "WaitForGameOver"
              },
              {
                // word previously said check
                guard: ({ event, context }) => {
                  const utterance = event.value[0].utterance.toLocaleLowerCase();
                  const already_said = context.previous_words.includes(utterance);
                  return already_said
                },
                target: "WaitForWordAlreadySaid"
              },
              {
                // original word
                guard: ({ event }) => event.value[0].utterance != null,
                actions: assign(({ event, context }) => {
                  const current_utterance = event.value[0].utterance.toLowerCase();
                  const updated_list = context.previous_words.concat(current_utterance);
                  return {
                    lastResult: event.value,
                    current_word: current_utterance,
                    previous_words: updated_list,
                    pt_user: (context.pt_user ?? 0) + 1,
                  }
                }),
                target: "WaitForMachineTurn"
              },
            ],
            ASR_NOINPUT: {
              target: "WaitForUserTurnReprompt"
            },
          },
        },
        WordAlreadySaid: {
          entry: { type: "spst.speak", params: { utterance: `Sorry, that word has already been said. You lose.` } },
          on: { SPEAK_COMPLETE: "GameOver" },
        },
        MachineTurnThink: {
          entry: [
            assign(({ context }) => {
              const new_word = getComputerWord(context.current_word ?? "", context.previous_words);
              const updated_list = context.previous_words.concat(new_word.word);
              return {
                current_word: new_word.word,
                association_found: new_word.success,
                previous_words: updated_list,
              };
            }),
          ],
          after: {
            // wait one second before responding
            1000: "MachineTurnSpeak"
          }
        },
        MachineTurnSpeak: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                // pt_machine: (context.pt_machine ?? 0) + 1,
                utterance: context.current_word ?? ""
              })
            }],
          on: { SPEAK_COMPLETE: [
              {
                // did not find a new category
                guard: ({ context }) => !(context as any).association_found,
                target: "GameOver"
              },
              {
                // computer successfully found an association/category
                // increment points
                actions: assign(({ context}) => ({
                  pt_machine: (context.pt_machine ?? 0) + 1,
                })),
                // go back to user's turn
                target: "UserTurn"
              }
            ]
          }
        },
        GameOver: {
          // todo: add sound effect and different text + visuals if the user wins
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Great game ${context.name}! The final score was ${context.pt_user} for you, and ${context.pt_machine} for me. Thanks for playing!`
            })
          },
          on: { SPEAK_COMPLETE: "#DM.Done"}
        },
        WaitForPlayerReadyReprompt: {
          on: {
            LISTEN_COMPLETE: "PlayerReady"
          }
        },
        WaitForWordAlreadySaid: {
          on: {
            LISTEN_COMPLETE: "WordAlreadySaid"
          }
        },
        WaitForEndGameNotReady: {
          on: {
            LISTEN_COMPLETE: "EndGameNotReady"
          }
        },
        WaitForSpeechIdleAfterPlayerReady: {
          on: {
            LISTEN_COMPLETE: "AskName"
          }
        },
        WaitForSpeechIdleAfterName: {
          on: {
            LISTEN_COMPLETE: "StartGame"
          }
        },
        WaitForExplainRules: {
          on: {
            LISTEN_COMPLETE: "ExplainRules"
          }
        },
        WaitForPlayerReady: {
          on: {
            LISTEN_COMPLETE: "StartGame"
          }
        },
        WaitForMachineTurn: {
          on: {
            LISTEN_COMPLETE: "MachineTurnThink"
          }
        },
        WaitForUserTurn: {
          on: {
            LISTEN_COMPLETE: "UserTurn"
          }
        },
        WaitForGameOver: {
          on: {
            LISTEN_COMPLETE: "GameOver"
          }
        },
      },
    },
    Done: {
      on: {
        CLICK: {
          target: "#DM.Greeting.Prompt",
          actions: assign (resetContext),
        },
      },
    },
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButtons(
    startButton: HTMLButtonElement,
    stopButton: HTMLButtonElement,
    restartButton: HTMLButtonElement,
) {
  // toggle the started bool to display status messages once the game is started
  let started = false;
  // set up scoreboard
  const scoreboard = document.querySelector<HTMLDivElement>("#scoreboard")!;
  const ptUser = document.querySelector<HTMLParagraphElement>("#pt_user")!;
  const ptMachine = document.querySelector<HTMLParagraphElement>("#pt_machine")!;

  startButton.addEventListener("click", () => {
    dmActor.send({type: "CLICK"});
    started = true;
    // show scoreboard
    scoreboard.style.display = "block";
    // reset points
    ptUser.innerHTML = "0";
    ptMachine.innerHTML = "0";
  });

  stopButton.addEventListener("click", () => {
    dmActor.send({ type: "STOP" });
    started = false;
    startButton.innerHTML = "START";
    // hide scoreboard
    scoreboard.style.display = "none";
    // reset points
    ptUser.innerHTML = "0";
    ptMachine.innerHTML = "0";
  });

  // assign CLICK type to the restart button so that it goes back to the Greeting state
  restartButton.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
    started = true;
    startButton.innerHTML = "START";
    // show scoreboard
    scoreboard.style.display = "block";
    // reset points
    ptUser.innerHTML = "0";
    ptMachine.innerHTML = "0";
  });

  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
        snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };

    // if Done state is reached, turn started back to false
    if (snapshot.value === "Done") {
      started = false;
    }

    if (started) {
      startButton.innerHTML = `Status: "${meta.view ?? ""}"`;
    } else {
      startButton.innerHTML = `START`;
    }

    // update points when context changes
    if (ptUser) ptUser.innerHTML = `${snapshot.context.pt_user ?? 0}`;
    if (ptMachine) ptMachine.innerHTML = `${snapshot.context.pt_machine ?? 0}`;
  });
}
