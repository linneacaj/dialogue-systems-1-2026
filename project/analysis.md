# Project Analysis

### Background: the Word Association Game

The game I set out to create is a version of a game that I used to play in the car or on field trips with my classmates. 
It is a fairly open-ended and creative dialogue game (which I realized very soon makes it harder to implement in code).

The general idea is that you and your opponent take turns thinking of a word. The first person who picks a word can
choose anything they want, the next person must then choos a word that is associated to the first word. The turn then
goes back to the first player, who needs to think of a word associated to the previous one. 

For example: 
```
Player 1: tree
Player 2: apple
Player 1: pie
Player 2: math 
Player 1: math?? how does that relate?
Player 2: you know "pi" as in 3.1415
Player 1: ohh okay. 
Player 1: blackboard [continues their turn from the word "math"]
Player 2: chalk 
...
```

________________

### Rules:
- Each player takes turn naming a word. The current word must be associated to the previous word somehow.
- You cannot take more than 5 seconds to think of a word (automatic loss).
- You cannot repeat a word (automatic loss).
- If a word seems too random/unrelated, the opponent may challenge the association (they can ask how it relates).
If the original player is not able to defend their word choice adequately, they lose. This part is especially open-ended
since both players need to discuss, and come to an agreement about the validity of the word.
- The "word" can at most be 2 words long. For example, "apple pie" is valid, but "grandma's apple pie" is too long.
- If someone gives up, the other player wins.
- You cannot simply pick synonyms. For example, if the current word is "sofa", the next word cannot be "couch".

The winner of the game is whoever does not take too long, repeat a word, fail to defend their word choice, or give up.

________________

### Tech Stack:

- Vite, HTML, TypeScript: building the application
- SpeechState, Stately.ai, Xstate: dialogue management
- Azure NLU: natural language understanding of responses
- Groq API: creating and fetching responses for the machine in the game

________________

### Development Process
I decided to use an agile development process in this project, and therefore I made two different versions of this
game (and designed a third version), all with different levels of complexity. The first version is very basic
and focused mostly on setting up the UI, and the basic dialgoue structure around managing the gameplay sequences.
The second and third versions then improved upon the first version and made it increasingly intelligent and flexible.

The reason why I made so many versions is that I was unsure how much I was going to be able to complete in 
the given timeframe, and with my current experience. The first version was to serve as a "minimum viable product", so 
that the other versions would just be an added bonus if they ended up working. In order to make up for the complexity
in implementing the word-choices and challenges seamlessly, I wanted to make sure that the rest of the interactions
in managing the gameplay was as flexible and seamless as possible. I put more effort in making the UI and the introductory
dialogue in the game as natural as I could.

The general overview of the versions is as follows:
- v1: hard-coded/scripted categories.
  - Very basic, the computer loses most of the time.
  - Cannot dispute/challenge answers.
- v2: the most intelligent version.
  - Uses the Groq API and Meta's LLM to pick new words.
  - Can respond to challenges.
- v3: medium complexity/intelligence (this version has only been designed, not implemented)
  - Uses a trained word embedding model to pick new words.
  - Can make challenges based on whether the absolute value of the cosine similarity is greater than X.
  - Unsure of how well this version would be able to defend/respond to challenges.

________________

### Version 1

In this version I focused mostly on creating the introductory dialogue and the UI. I wanted the game to start in the most
natural way possible. The user is able to give their name to the machine in various different ways (based on intents from
Azure NLU), and the user is also able to ask the machine for instructions. 

This version makes word associations using a hardcoded dictionary, so it is very easy for the user to win.
The dictionary approach is not ideal for real gameplay, but I wanted to have a minimum viable product that 
demonstrates how the game would be played. In this version there is no time limit on the responses and neither 
the human nor the computer can make a challenge. 

________________

### Version 2

This is the most intelligent/complex implementation of this game because it most closely mimics playing it with another
human being. There are still a lot of improvements that need to be made to get it to pass the Turing test, but compared
to version 1, it is a world of a difference. In this version, the computer makes good associations to the opponent's words,
and it is able to defend its word choice when questioned.

I have a fair amount of experience with APIs from backend programming in Python and AWS, so I underestimated how 
difficult it would be to implement the API in this project. Getting the API calls to work using curl in my terminal 
was easy, and Groq has some documentation that I followed [here](https://console.groq.com/docs/api-reference#chat-create).
The hard part was making sure the API call could run in my state machine using asynchronous functions, promises and
awaits. 

In the end the API calls work well, and the response speed is fast enough that it does not disrupt the dialogue flow.
When the app queries the Groq API to come up with a new word I tried to be as explicit in my instructions as possible
to prevent any hallucinations. So far in my testing I have not gotten any hallucinations, but that is of course 
impossible to prevent entirely. 

The query that I send to the API to generate a word can be found in the getComputerWordAI function in `dm.ts`. The query
explains the rules of the game, gives a list of the previously said words that are not to be repeated, gives the current
word that the LLM should generate an association to, and tells it to only respond in a dictionary format, with no other 
words or punctuations: `{ "word": "enter_new_word_here", "motivation": "enter_motivation_here"}`


#### Drawbacks:

In version 1 and 2 of the game, the computer is not able to judge whether a word said by the human is closely associated
or not. That is to say that the computer is not able to make challenges. This also means that the human can cheat by 
saying any random word, and the computer will accept it as valid. For example, if the computer says "sofa" and the human
responds with "wizard", there are no ramifications.


________________

### Version 3 (future improvements)

My plan for a version 3 of this game is to improve two main things: to be completely built "in-house"
(to not rely on an LLM), and for the machine to be able to make challenges if the human says a seemingly random word.

To solve the first issue: not relying on an LLM anymore, I was thinking that the computer could rely on a trained word-embedding
model instead. Word embedding models are something that we have learned about in the Machine Learning class, so it would
be feasible with my current experiences in MLT. However, this also comes with some limitations since I would need to train
a model with adequately large vocabulary so that the computer is able to recognize nearly all words said by the human,
but the word embeddings cannot get too big to interfere with memory or speed. Another challenge is to come up with a 
way for the model to be able to generate justifications in a natural sounding way if the human decides to challenge
a response. 

Considerations:
- train a word embedding model that picks the next word association. 
  - make sure the size of the word embeddings is small enough and the vocabulary size is large enough
  - does the model pick the next word at random from the x nearest words in the matrix? It needs to be careful not to pick synonyms
  - how does it generate motivations? (defend challenges)
  - it should make a challenge if the human picks a word whose embedding has a cosine similarity greater than X.
    - how does the model know whether to accept or reject the humans' justification?

#### Drawbacks:

The main drawback with this version of the game is that since the game relies on a trained word embedding model,
it will not be as good as an LLM in generating natural language text. Therefore, defending against a challenge will
likely be very difficult to implement due to it being a highly unpredictable dialogue. A multi-million dollar LLM
will be much better at generaating human-sounding text, so maybe the ideal version of this game would be a hybrid of 
version 2 and 3, where a word-embedding model and cosine similarities are used to decide when the machine should challenge
an association, and the LLM is used to generate new associations and to defend against challenges. 
