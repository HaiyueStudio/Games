[Defaults]
command.time = 15
command.buffer.time = 1

[Command]
name = "dummy"
command = s

[Statedef -1]

[State -1, order digit three]
type = VarSet
triggerall = RoundState = 2
trigger1 = StateNo = 0
trigger1 = Time = 0
v = 0
value = var(0) * 10 + 3

[State -1, transition before current]
type = ChangeState
triggerall = RoundState = 2
trigger1 = StateNo = 0
trigger1 = Time = 0
value = 100

[State -1, forbidden after transition]
type = VarSet
triggerall = RoundState = 2
trigger1 = StateNo = 100
trigger1 = Time = 0
v = 9
value = 1
