# autonomous-software-agents

Command to start agent : node --env-file=.env index.js

TODO:
- documentare tutto (soprattuto i valori ritornati dalle varie funzioni e spiegazione dei casi possibili)
- check del codice in base ai valori ritornati dalle varie funzioni
- gestire le await con dei timeout (da capire la questione delle promise "skippate")
- migliorare la intention revision (esempi: [1] check che il pacchetto da prendere sia ancora disponibile, tenendo conto dell'area di visione ; [2] scadenza pacchetti in black list ; )
- strategia per la raccolta di pacchetti multipli prima della consegna (sia agente singolo che multipli)
- migliorare la coordinazione degli agenti multipli (ad esempio gestire meglio le 6 challenge proposte)
- fare il report