;whip吊るされ---------------------------------------------------------------------
;相手
;------------------------ 開始
[Statedef 30050]
type = A
movetype = I
physics = N
;anim = 10010
ctrl = 0
velset = 0, 0
sprpriority = 2

[State -3]
type = ScreenBound
trigger1 = 1
value = 1
movecamera = 0,0

[State 30050,0]
type = posset
trigger1 = time = 0
x =Enemy,fvar(1)

[State 210, 3]
type = PlayerPush
trigger1 = time >= 0
value = 0

[State 2000, Override]
type = HitOverride
trigger1 = 1
slot = 0
attr = SCA,SA,NA,HA
stateno = 30051
;time = -1

[State 3000, posadd]
type = posadd
trigger1 = time = 2
trigger2 = time = 4
x = 4

[State 3000, posadd]
type = posadd
trigger1 = time = 1
trigger2 = time = 3
trigger3 = time = 5
x = -4

[State 210, 3]
type = ScreenBound
trigger1 = time > 0
value = 0

[State 3000, posadd]
type = posadd
trigger1 = time = 0
trigger2 = time = 6
x = 2

[State 1000, PlaySnd]
type = PlaySnd
triggerall = prevstateno != [30050,30052]
trigger1 = time = 2
value = 4218,23 
channel = 0

[State 1000, PlaySnd]
type = PlaySnd
trigger1 = time = 100
trigger2 = time = 170
trigger3 = time = 320
trigger4 = time = 560
value = 4218,22
channel = 0
;-------------------------------------------------------------
[State 3000, posadd]
type = posadd
trigger1 = time = 321
trigger2 = time = 323
trigger3 = time = 325
x = -2
[State 3000, posadd]
type = posadd
trigger1 = time = 322
trigger2 = time = 324
x = 2
[State 3000, posadd]
type = posadd
trigger1 = time = 320
x = 3
;-------------------------------------------------------------
[State 3000, posadd]
type = posadd
trigger1 = time = 562
trigger2 = time = 566
trigger3 = time = 570
x = -2
[State 3000, posadd]
type = posadd
trigger1 = time = 564
trigger2 = time = 568
trigger3 = time = 573
x = 2
[State 3000, posadd]
type = posadd
trigger1 = time = 560
x = -1
;-------------------------------------------------------------
[State 3000, posadd]
type = posadd
trigger1 = time = 171
trigger2 = time = 173
trigger3 = time = 175
x = -2
[State 3000, posadd]
type = posadd
trigger1 = time = 172
trigger2 = time = 174
x = 2
[State 3000, posadd]
type = posadd
trigger1 = time = 170
x = 1
;-------------------------------------------------------------
[State 3000, posadd]
type = posadd
trigger1 = time = 241
trigger2 = time = 243
trigger3 = time = 245
x = -2
[State 3000, posadd]
type = posadd
trigger1 = time = 242
trigger2 = time = 244
x = 2
[State 3000, posadd]
type = posadd
trigger1 = time = 240
x = 3
;-------------------------------------------------------------
[State 3000, posadd]
type = posadd
trigger1 = time = 853
trigger2 = time = 859
trigger3 = time = 864
x = -2
[State 3000, posadd]
type = posadd
trigger1 = time = 856
trigger2 = time = 861
x = 2
[State 3000, posadd]
type = posadd
trigger1 = time = 850
x = 3
;-------------------------------------------------------------
[State 3000, posadd]
type = posadd
trigger1 = time = 461
trigger2 = time = 463
x = -2
[State 3000, posadd]
type = posadd
trigger1 = time = 462
x = 2

;-------------------------------------------------------------
[State 3000, posadd]
type = posadd
trigger1 = time = 712
trigger2 = time = 716
trigger3 = time = 721
x = -2
[State 3000, posadd]
type = posadd
trigger1 = time = 714
trigger2 = time = 718
x = 2
[State 3000, posadd]
type = posadd
trigger1 = time = 710
x = 3
;-------------------------------------------------------------

;-------------------------------------------------------------

[State 1000, PlaySnd]
type = PlaySnd
trigger1 = time = 70
trigger2 = time = 240
trigger3 = time = 850
trigger4 = time = 460
trigger5 = time = 710
value = 4218,21 
channel = 0 

[State 3000, posadd]
type = posadd
;triggerall = prevstateno != [30050,30052]
trigger1 = time = 56
trigger2 = time = 61
trigger3 = time = 78
trigger4 = time = 85
trigger5 = time = 101
trigger6 = time = 110
x = 9-7*(prevstateno = [30050,30052])
y = -1

[State 3000, posadd]
type = posadd
;triggerall = prevstateno != [30050,30052]
trigger1 = time = 50
trigger2 = time = 68
trigger3 = time = 73
trigger4 = time = 85
trigger5 = time = 94
trigger6 = time = 101
x = -9+7*(prevstateno = [30050,30052])
y = -1+2*(prevstateno = [30050,30052])

[State 200,VarSet(17)]
type = lifeadd
trigger1 = Time >= 0
trigger1 = GameTime % 4 = 0
value = -1

[State 3000, End]
type = Null; Changeanim2
trigger1 = time= 0
value = 10050
ctrl = 0

[State 3000, End]
type = selfState
trigger1 = time= 1000
value = 5100
ctrl = 1

;---------------------------------------------------------------------
;相手
;------------------------ 開始
[Statedef 30051]
type = A
movetype = I
physics = N
;anim = 10010
ctrl = 0
velset = 0, 0

[State -3]
type = ScreenBound
trigger1 = 1
value = 1
movecamera = 0,0

[State 1000, PlaySnd]
type = PlaySnd
triggerall = time = 0
trigger1 = anim = 10050
trigger1 = Selfanimexist(10051) = 0
trigger2 = anim = 10051
trigger2 = Selfanimexist(10050) = 0 
value = 4218,ifelse(random< 333,23,ifelse(random> 777,21,22))
channel = 0

[State 210, 3]
type = PlayerPush
trigger1 = time >= 0
value = 0

[State 2000, Override]
type = HitOverride
trigger1 = 1
slot = 0
attr = SCA,SA,NA,HA
stateno = 30052
;time = -1

;[State 3000, posadd]
;type = posadd
;trigger1 = time = 0
;trigger2 = time = 2
;trigger3 = time = 4
;x = 1

;[State 3000, posadd]
;type = posadd
;trigger1 = time = 1
;trigger2 = time = 3
;trigger3 = time = 5
;x = -1

[State 210, 3]
type = ScreenBound
trigger1 = time > 0
value = 0


[State 1000, PlaySnd]
type = PlaySnd
triggerall = time = 0
trigger1 = anim = 10050
trigger1 = Selfanimexist(10051)
value = 4218,ifelse(random< 500,23,22)
channel = 0

[State 1000, PlaySnd]
type = PlaySnd
triggerall = time = 0
trigger1 = anim = 10052
trigger2 = Selfanimexist(10050)
trigger2 = anim = 10051 
value = 4218,ifelse(random< 500,21,20)
channel = 0

[State 200,VarSet(17)]
type = lifeadd
trigger1 = Time >= 0
trigger1 = GameTime % 4 = 0
value = -1

[State 3000, End]
type = Changeanim2
triggerall = !SelfAnimexist(10051)
trigger1 = time= 0
value = 10050
ctrl = 0

[State 3000, End]
type = Changeanim2
triggerall = SelfAnimexist(10051)
trigger1 = time= 0
value = 10051
ctrl = 0

[State 3000, End]
type = selfState
trigger1 = time = 55
value = 30050
ctrl = 0

;---------------------------------------------------------------------
;相手
;------------------------ 開始
[Statedef 30052]
type = A
movetype = I
physics = N
;anim = 10010
ctrl = 0
velset = 0, 0

[State -3]
type = ScreenBound
trigger1 = 1
value = 1
movecamera = 0,0

[State 210, 3]
type = PlayerPush
trigger1 = time >= 0
value = 0

[State 2000, Override]
type = HitOverride
trigger1 = 1
slot = 1
attr = SCA,SA,NA,HA
stateno = 30051
;time = -1


[State 3000, NotHitBy]
type = posadd
trigger1 = time = 2
trigger2 = time = 4
x = 4

[State 3000, NotHitBy]
type = posadd
trigger1 = time = 1
trigger2 = time = 3
trigger3 = time = 5
x = -4

[State 210, 3]
type = ScreenBound
trigger1 = time > 0
value = 0

[State 3000, NotHitBy]
type = posadd
trigger1 = time = 0
trigger2 = time = 6
x = 2

[State 1000, PlaySnd]
type = PlaySnd
triggerall = time = 0
trigger1 = anim = 10050
trigger1 = Selfanimexist(10051) = 0
trigger2 = anim = 10051
trigger2 = Selfanimexist(10050) = 0 
value = 4218,ifelse(random< 333,23,ifelse(random> 777,21,22))
channel = 0

[State 1000, PlaySnd]
type = PlaySnd
triggerall = time = 0
trigger1 = anim = 10050
trigger1 = Selfanimexist(10051)
value = 4218,ifelse(random< 500,23,22)
channel = 0


[State 1000, PlaySnd]
type = PlaySnd
triggerall = time = 20
trigger1 = anim = 10052
trigger2 = Selfanimexist(10050)
trigger2 = anim = 10051 
value = 4218,ifelse(random< 777,21,20)
channel = 0

[State 200,VarSet(17)]
type = lifeadd
trigger1 = Time >= 0
trigger1 = GameTime % 4 = 0
value = -1

[State 3000, End]
type = Changeanim2
triggerall = !SelfAnimexist(10051)
trigger1 = time= 0
value = 10050
ctrl = 0

[State 3000, End]
type = Changeanim2
triggerall = SelfAnimexist(10051)
trigger1 = time= 0
value = 10051
ctrl = 0

[State 3000, End]
type = selfState
trigger1 = time= 55
value = 30050
ctrl = 0
