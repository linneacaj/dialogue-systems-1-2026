import { assign, createActor, setup, fromPromise } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY, GROQ_KEY } from "./azure";
import type { DMContext, DMEvents, NLUObject, Entity } from "./types";

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
  // default timeout = 5s
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-AvaNeural",
};

async function getComputerWordAI(word: string, previous_words: string[]): Promise<{ word: string, motivation: string }> {
  /*
  This function uses the Groq API and Meta LLM to take the information from the current state of the game (current word,
  and previously said words), to select a new word for the machine to use. This function will also return a motivation
  of why the LLM chose the word that it did, so that this motivation can be used in case the opponent wants to challenge
  the word.

  This function is asynchronous because it is making an API call to an external service which may take some time. Making
  this function asynchronous and using the "await" keyword makes sure that the program knows to wait for a response from the API
  before proceeding.
  Note: An async function must return a promise, so the return type of this function is the expected dictionary wrapped in a promise.

  :param word: current word to find an association to
  :param previous_words: a list of previous words that have been said in this game. (These words cannot be repeated).
  return: a dictionary containing the new word and motivation
   */
  // console.log("##### In getComputerWordAI function ###### ")
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `You are playing the category game. You and your opponent have to keep naming words associated
          to the previous word. You cannot repeat a word that has already been said. Do not choose a synonym.
          Find a word in a different category that relates to the previous word somehow.
          Come up with a word association to: ${word}.
          You cannot choose any of the following words: ${previous_words.join(", ")}
          You also need to come up with a motivation for why your chosen word is associated to the previous word. Motivation should be one sentence max.
          Respond only with a JavaScript object dictionary in the following format, no other text or punctuations: { "word": "enter_new_word_here", "motivation": "enter_motivation_here"}`
          }
        ],
      })
    } );
    const data = await response.json();
    // console.log("GROQ response 1: ", data)
    const raw = data.choices[0].message.content ?? "";
    // console.log("GROQ response 2: ", raw)

    const parsed = JSON.parse(raw);
    console.log("Parsed Groq response: ", parsed);
    return parsed;

  } catch (error) {
    console.error(`ERROR: ${error}`);
  }
  // only reaches this return statement if the API fails
  return {"word": "", "motivation": ""};
}


function getEntity(entities: Entity[], category: string) {
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
  pt_machine: 0,
  pt_user: 0,
  current_word: null,
  association_found: null,
  name: null,
  lastResult: null,
  current_motivation: null,
  previous_words: [],
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actors: {
    // todo: explain the actors section and fromPromise
    getComputerWordAI: fromPromise(async ({ input }: {input: { current_word: string, previous_words: string[]}}) => {
      return getComputerWordAI(input.current_word, input.previous_words);
    }),
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
    pt_machine: 0,
    pt_user: 0,
    name: null,
    current_word: null,
    current_motivation: null,
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
        // allow stop button to fire from anywhere in the dialogue
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
          entry: { type: "spst.speak", params: { utterance: `Hello, let's play the word asociation game!` } },
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
              utterance: `Nice to meet you ${context.name}, let's start the game! You can go first, pick a word.`
            })
          },
          on: { SPEAK_COMPLETE: "UserTurn" },
        },
        StartGamePlayerReady: {
          entry: {
            type: "spst.speak", params: { utterance: `Great, let's start the game! You can go first, pick a word.`}
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
        TooSlow: {
          entry: { type: "spst.speak", params: { utterance: `Time's up! You took too long to think of a word.` } },
          on: {
            SPEAK_COMPLETE: "GameOver",
          },
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
                  // const nluValue = event.nluValue as NLUObject;
                  const entities: Entity[] = event.nluValue.entities;
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
                guard: ({ event }) => (event.nluValue as NLUObject)?.topIntent === "AskForInstructions",
                actions: assign(({ event }) => {
                  const entities: Entity[] = event.nluValue.entities;
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
              guard: ({event}) => (event.nluValue as NLUObject)?.topIntent === "Agree",
              target: "WaitForSpeechIdleAfterPlayerReady"
            },
              {
                // check if the person responded no
                guard: ({event}) => (event.nluValue as NLUObject)?.topIntent === "Disagree",
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
                guard: ({ event }) => (event.nluValue as NLUObject)?.topIntent === "GiveUp",
                target: "WaitForGameOver"
              },
              {
                // handle HowToPlay intent
                guard: ({ event, context }) => (event.nluValue as NLUObject)?.topIntent === "AskForInstructions" && context.pt_user < 1,
                target: "WaitForExplainRules"
              },
              {
                // word previously said check
                guard: ({ event, context }) => {
                  const utterance = event.value[0].utterance.toLowerCase();
                  const already_said = context.previous_words.includes(utterance);
                  return already_said
                },
                target: "WaitForWordAlreadySaid"
              },
              {
                // check if the person asked to hear the motivation/clarification
                guard: ({event}) => (event.nluValue as NLUObject)?.topIntent === "AskForClarification",
                target: "WaitForMachineMotivation"
              },
              {
                // check if the person said too many words
                guard: ({event}) => {
                  const curr_utterance = event.value[0].utterance
                  // return true if the current utterance is not null and the word count is over 2
                  return curr_utterance != null && curr_utterance.trim().split(/\s+/).length > 2;
                },
                actions: assign(({ event, context }) => {
                  const current_utterance = event.value[0].utterance.toLowerCase();
                  return {
                    lastResult: event.value,
                    current_word: current_utterance,
                    // give machine a point because user said too many words
                    pt_machine: (context.pt_machine ?? 0) + 1,
                  }
                }),
                target: "WaitForAnswerTooLong"
              },
              {
                // original word check
                guard: ({ event }) => {
                  const curr_utterance = event.value[0].utterance
                  // return true if the current utterance is not null and the word count is max 2
                  return curr_utterance != null && curr_utterance.trim().split(/\s+/).length <= 2;
                },
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
          },
          after: {
            // after 5 seconds time is up
            5000: "WaitForTooSlow",
          }
        },
        WordAlreadySaid: {
          entry: { type: "spst.speak", params: { utterance: `Sorry, that word has already been said. You lose.` } },
          on: { SPEAK_COMPLETE: "GameOver" },
        },
        EndGameMachineLose: {
          entry: { type: "spst.speak", params: { utterance: `Okay that means you win! My word was not closely related enough.` } },
          on: { SPEAK_COMPLETE: "GameOver" },
        },
        MotivationResponseReprompt: {
          entry: { type: "spst.speak", params: { utterance: `Sorry, I didn't understand that. Do you agree with my motivation?` } },
          on: { SPEAK_COMPLETE: "CheckPlayerAcceptMotivation" },
        },
        MachineRepeatPreviousWord: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `Great! Now it's your turn again. I just said ${context.current_word}.`
            })
          },
          on: { SPEAK_COMPLETE: "UserTurn" },
        },
        MachineMotivation: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `I chose the word ${context.current_word} because ${context.current_motivation}. Do you think that's valid?`
            })
          },
          on: { SPEAK_COMPLETE: "CheckPlayerAcceptMotivation" },
        },
        AnswerTooLong: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `You said ${context.current_word} and that is too many words.`
            })
          },
          on: { SPEAK_COMPLETE: "GameOver" },
        },
        CheckPlayerAcceptMotivation: {
          entry: { type: "spst.listen.nlu" },
          on: {
            RECOGNISED: [{
              // check if the person responded yes
              guard: ({event}) => ( event as any).nluValue?.topIntent === "Agree",
              target: "WaitForMachineRepeatPreviousWord"
            },
              {
                // check if the person responded no
                guard: ({event}) => ( event as any).nluValue?.topIntent === "Disagree",
                actions: assign(({ context }) => {
                  return {
                    pt_machine: (context.pt_machine ?? 0) - 1,
                  }
                }),
                target: "WaitForEndGameMachineLose"
              },
              {
                // check if the person asked to repeat
                guard: ({event}) => ( event as any).nluValue?.topIntent === "RepeatMotivation",
                target: "WaitForMachineMotivation"
              },
              {
                // utterance was not in grammar
                actions: assign({ lastResult: null }),
                target: "WaitForMotivationResponseReprompt"
              }
            ],
            // no response given
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
              target: "WaitForMotivationResponseReprompt"
            },
          },
        },
        MachineTurnThink: {
          invoke: {
            // call the getComputerWordAI function using fromPromise, because the return type of the async function is a promise.
            src: fromPromise(async ({ input }: { input: {current_word: string, previous_words: string[] }}): Promise<{word: string, motivation: string}>  => {
              return getComputerWordAI(input.current_word, input.previous_words);
            }),
            input: ({ context }) => ({
              current_word: context.current_word ?? "",
              previous_words: context.previous_words,
            }),
            onDone: {
              actions: assign (({ event, context }) => {
                const response = event.output as {word: string, motivation: string};
                return {
                  current_word: response.word,
                  current_motivation: response.motivation,
                  association_found: true,
                  previous_words: context.previous_words.concat(response.word)
                };
              }),
              target: "MachineTurnSpeak"
            },
            onError: {
              actions: assign({
                current_word: "I can't think of anything, you win!",
                association_found: false
              }),
              target: "MachineTurnSpeak"
            }
          },
        },
        MachineTurnSpeak: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance: context.current_word ?? ""
              })
            }],
          on: { SPEAK_COMPLETE: [
              {
                // did not find a new category
                guard: ({ context }) => context.association_found !== true,
                target: "GameOver"
              },
              {
                // computer successfully found an association/category
                // increment points for the machine
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
        WaitForTooSlow: {
          entry: assign(({ context }) => {
            return {
              // machine gets a point if user is too slow
              pt_machine: (context.pt_machine ?? 0) + 1,
            };
          }),
          on: {
            LISTEN_COMPLETE: "TooSlow"
          }
        },
        WaitForMotivationResponseReprompt: {
          on: {
            LISTEN_COMPLETE: "MotivationResponseReprompt"
          }
        },
        WaitForEndGameMachineLose: {
          on: {
            LISTEN_COMPLETE: "EndGameMachineLose"
          }
        },
        WaitForMachineRepeatPreviousWord: {
          on: {
            LISTEN_COMPLETE: "MachineRepeatPreviousWord"
          }
        },
        WaitForMachineMotivation: {
          on: {
            LISTEN_COMPLETE: "MachineMotivation"
          }
        },
        WaitForAnswerTooLong: {
          on: {
            LISTEN_COMPLETE: "AnswerTooLong"
          }
        },
        WaitForWordAlreadySaid: {
          entry: assign(({ context }) => {
            return {
              // machine gets a point if user is too slow
              pt_machine: (context.pt_machine ?? 0) + 1,
            };
          }),
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
            LISTEN_COMPLETE: [
              {
                // if the name was already given, go straight to UserTurn
                guard: ({ context }) => context.name !== null,
                target: "StartGamePlayerReady"
              },
              {
                // if we don't know the users name yet, go to AskName
                target: "AskName"
              }
            ],
          },
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
        WaitForUserTurnReprompt: {
          on: {
            LISTEN_COMPLETE: "UserTurnReprompt"
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
