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

[Statedef -1]

[State -1, attack]
type = ChangeState
triggerall = ctrl
trigger1 = command = "x"
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
