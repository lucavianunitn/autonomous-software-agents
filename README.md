# autonomous-software-agents

Command to start agent : node --env-file=.env index.js


Steps package-related:
1) Compute agent-package distance
2) Compute packages-deliveryCell distance
3) Compute "agent density-distance" near a package, to understand if it can be stolen (maybe by also considering its trajectory)
4) Based on 1. 2. 3. and by their value, rank the packages in order to maximize the score

Steps map related:
1) Compute positions where the agents can see more cells
2) Compute "centralized positions", drom which it's easily possible to reach other cells or delivery points
3) Move randomly near those areas (offensive strategy)
4) Stay blocked on most appealing delivery point (defensive)

General:
1) BDI coherent structure



Communication
1) COndivisione agenti percepiti, fine
2) Condivisione pacchetti, contrattazione per chi se ne occupa

