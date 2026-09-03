[Defaults]
command.time = 15
command.buffer.time = 1

[Command]
name = "holdfwd"
command = /$F

[Command]
name = "holdback"
command = /$B

[Command]
name = "holddown"
command = /$D

[Command]
name = "holdup"
command = /$U

[Command]
name = "x"
command = x

[Command]
name = "y"
command = y

[Command]
name = "a"
command = a

[Command]
name = "b"
command = b

[Statedef -1]

[State -1, attack x]
type = ChangeState
triggerall = ctrl
trigger1 = command = "x"
value = 200

[State -1, attack y]
type = ChangeState
triggerall = ctrl
trigger1 = command = "y"
value = 200

[State -1, attack a]
type = ChangeState
triggerall = ctrl
trigger1 = command = "a"
value = 200

[State -1, attack b]
type = ChangeState
triggerall = ctrl
trigger1 = command = "b"
value = 200

[State -1, jump]
type = ChangeState
triggerall = ctrl
trigger1 = command = "holdup"
value = 40

[State -1, crouch]
type = ChangeState
triggerall = ctrl
trigger1 = command = "holddown"
value = 10

[State -1, forward]
type = ChangeState
triggerall = ctrl
trigger1 = command = "holdfwd"
value = 20

[State -1, back]
type = ChangeState
triggerall = ctrl
trigger1 = command = "holdback"
value = 21
