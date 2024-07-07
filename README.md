# autonomous-software-agents

To run the presented project it is necessary to start locally Deliveroo with the instructions provided in https://github.com/unitn-ASA/Deliveroo.js. 

Then, it’s requested to clone the presented repository through:
```console
git clone https://github.com/lucavianunitn/autonomous-software-agents.git && cd autonomous-software-agents
```

It’s possible to install the used dependencies through:
```console
npm install
```

Creating a .env file by renaming in “.env” the proposed “.env.example” present at the root directory, with care given to adding personal agents tokens and defining, based on personal preferences, the host to use and which categories of debug messages there is the desire to be printed in the console. The two agents playing in a team must be named ending with “_1” and “_2” respectively to make them work properly. 
Finally, it’s possible to execute the single and individual agents by doing:
```console
node --env-file=.env index_single.js
```

and a couple of collaborative agents through:
```console
node --env-file=.env index_team.js
```
