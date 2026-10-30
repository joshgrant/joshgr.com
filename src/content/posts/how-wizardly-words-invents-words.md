---
title: How Wizardly Words Invents Words
date: 2026-10-30
description: It takes what we know and infers new words between the lines
---

I wanted to make a random word generator to help write stories and think new thoughts. After all, [naming is hard](https://martinfowler.com/bliki/TwoHardThings.html). What's a convincing name for a new city? Or a person? Or a food?

I ended up with a Markov-chain approach to figuring out probable letter combinations. You can feed the program a file, say a list of French words, and it will determine what's possible along with its probability.

There are some parallels with large language models, which is why I named the technique "Small Character Model"; likewise it uses a context window to determine the next most likely letter. For comparison (at the time of this writing) ChatGPT uses a context window of 128k tokens to determine the next word. Wizardly Words uses less than 10 letters. Yes, I know, not quite as beefy as ChatGPT, but also doesn't cost $700,000 a day to run. In fact, it's... free! 💸

Back to how it works: context matters, but it's also important to not overfit. If we were to have a context of 5 letters, instead of 3, we run the risk of creating words that sound too familiar. Here's the difference between words based on the English dictionary that use a context of 3 letters v. 5 letters:

| 3 Character Context | 5 Character Context |
| ------------------- | ------------------- |
| strate              | parcel              |
| potem               | cale                |
| votingl             | talist              |
| omicrom             | fade                |
| negapost            | ventra              |
| twent               | stimulale           |
| scro                | adonize             |
| intraino            | squa                |
| sumper              | butter              |
| aire                | encourage           |

You'll notice that the 5 character context comes up with more "realistic" sounding words, but more often finds words that already exist. The 3 character context model sounds less cohesive, but also allows for more interesting variants.

If you want to check it out, I have it [on the site here](/wizardly-words).