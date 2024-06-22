# autonomous-software-agents

Command to start agent : node --env-file=.env index.js

TODO:
- documentare tutto (soprattuto i valori ritornati dalle varie funzioni e spiegazione dei casi possibili) [SIMONE]
- check del codice in base ai valori ritornati dalle varie funzioni [NEXT MEETING]
- gestire le await con dei timeout (da capire la questione delle promise "skippate") [NEXT NEXT NEXT MEETING]
- migliorare la intention revision (esempi: [1] check che il pacchetto da prendere sia ancora disponibile, tenendo conto dell'area di visione (quindi se vedo che c'è un altro agente sopra o se pacchetto è stato carriedBY da qualcuno) ; [2] scadenza pacchetti in black list (magari con timeout) ; ) + divisione pacchetti se teammate a pari distanza [LUCA]
- strategia per la raccolta di pacchetti multipli prima della consegna (sia agente singolo che multipli) [SIMONE]
- migliorare la coordinazione degli agenti multipli (ad esempio gestire meglio le 6 challenge proposte) [NEXT MEETING, BOOM]
- fare il report