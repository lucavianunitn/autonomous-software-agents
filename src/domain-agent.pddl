;; domain file: domain-agent.pddl
(define (domain default)
    (:requirements :strips)
    (:predicates
        (me ?me)
        (tile ?t)
        (up ?t1 ?t2)
        (down ?t1 ?t2)
        (left ?t1 ?t2)
        (right ?t1 ?t2)
        (at ?me ?tile)
        (delivery ?dt)
        (to_deliver)
        (parcel ?p)
        (carry ?me ?p)
    )
    
    (:action move_up
        :parameters (?me ?from ?to)
        :precondition (and (me ?me) (tile ?from) (tile ?to) (at ?me ?from) (up ?from ?to))
        :effect (and (not (at ?me ?from)) (at ?me ?to))
    )

    (:action move_down
        :parameters (?me ?from ?to)
        :precondition (and (me ?me) (tile ?from) (tile ?to) (at ?me ?from) (down ?from ?to))
        :effect (and (not (at ?me ?from)) (at ?me ?to))
    )

    (:action move_left
        :parameters (?me ?from ?to)
        :precondition (and (me ?me) (tile ?from) (tile ?to) (at ?me ?from) (left ?from ?to))
        :effect (and (not (at ?me ?from)) (at ?me ?to))
    )

    (:action move_right
        :parameters (?me ?from ?to)
        :precondition (and (me ?me) (tile ?from) (tile ?to) (at ?me ?from) (right ?from ?to))
        :effect (and (not (at ?me ?from)) (at ?me ?to))
    )

    (:action pick_up
        :parameters (?me ?tile ?parcel)
        :precondition (and (me ?me) (tile ?tile) (at ?me ?tile) (parcel ?parcel) (at ?parcel ?tile) (not(carry ?me ?parcel)))
        :effect (and (carry ?me ?parcel) (not(at ?parcel ?tile)))
    )

    (:action put_down
        :parameters (?me ?tile ?parcel)
        :precondition (and (me ?me) (tile ?tile) (at ?me ?tile) (parcel ?parcel) (carry ?me ?parcel))
        :effect (and (not (carry ?me ?parcel)) (at ?parcel ?tile))
    )

    (:action put_down_on_delivery
        :parameters (?me ?tile ?parcel)
        :precondition (and (me ?me) (tile ?tile) (delivery ?tile) (at ?me ?tile) (parcel ?parcel) (carry ?me ?parcel) (to_deliver))
        :effect (and (not (carry ?me ?parcel)) (at ?parcel ?tile) (not(to_deliver)))
    )
)