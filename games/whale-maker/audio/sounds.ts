/** Original offline-rendered sounds, played through the public Engine mixer. */
export const SOUNDS={
    jump:{seconds:.22,gain:.48,priority:40,cooldown:.045},
    spin:{seconds:.32,gain:.44,priority:40,cooldown:.09},
    land:{seconds:.11,gain:.19,priority:5,cooldown:.12},
    step:{seconds:.08,gain:.09,priority:0,cooldown:.14},
    skid:{seconds:.28,gain:.26,priority:10,cooldown:.25},
    coin:{seconds:.3,gain:.48,priority:35,cooldown:.045},
    bump:{seconds:.15,gain:.4,priority:25,cooldown:.045},
    break:{seconds:.3,gain:.4,priority:30,cooldown:.06},
    reward:{seconds:.4,gain:.42,priority:35,cooldown:.08},
    power:{seconds:.72,gain:.58,priority:65,cooldown:.12},
    star:{seconds:.95,gain:.56,priority:65,cooldown:.2},
    fire:{seconds:.16,gain:.42,priority:30,cooldown:.045},
    hit:{seconds:.21,gain:.38,priority:25,cooldown:.06},
    stomp:{seconds:.2,gain:.46,priority:40,cooldown:.05},
    defeat:{seconds:.27,gain:.4,priority:30,cooldown:.06},
    kick:{seconds:.22,gain:.42,priority:35,cooldown:.06},
    grab:{seconds:.16,gain:.3,priority:25,cooldown:.08},
    throw:{seconds:.24,gain:.36,priority:30,cooldown:.06},
    spring:{seconds:.48,gain:.52,priority:45,cooldown:.1},
    splash:{seconds:.35,gain:.32,priority:20,cooldown:.15},
    swim:{seconds:.21,gain:.24,priority:20,cooldown:.12},
    pipe:{seconds:.48,gain:.42,priority:45,cooldown:.18},
    door:{seconds:.4,gain:.4,priority:40,cooldown:.18},
    checkpoint:{seconds:.85,gain:.54,priority:65,cooldown:.2},
    switch:{seconds:.25,gain:.43,priority:40,cooldown:.08},
    key:{seconds:.66,gain:.51,priority:55,cooldown:.12},
    metal:{seconds:.34,gain:.37,priority:35,cooldown:.1},
    pow:{seconds:.75,gain:.62,priority:80,cooldown:.15},
    stone:{seconds:.38,gain:.4,priority:35,cooldown:.1},
    cannon:{seconds:.3,gain:.32,priority:25,cooldown:.15},
    ice:{seconds:.38,gain:.36,priority:30,cooldown:.08},
    hurt:{seconds:.55,gain:.55,priority:75,cooldown:.2},
    death:{seconds:1.7,gain:.58,priority:95,cooldown:.5},
    goal:{seconds:1,gain:.54,priority:85,cooldown:.5},
    victory:{seconds:2.6,gain:.58,priority:95,cooldown:1},
    click:{seconds:.08,gain:.24,priority:45,cooldown:.035},
    edit:{seconds:.1,gain:.18,priority:5,cooldown:.065},
} as const;
export type Sound=keyof typeof SOUNDS;
export const SOUND_IDS=Object.keys(SOUNDS) as Sound[];
export const MUSIC={id:'pearl-breeze',bpm:128,bars:32,seconds:60,gain:.36} as const;
export const AUDIO_IDS=[...SOUND_IDS,MUSIC.id] as const;
export type AudioId=typeof AUDIO_IDS[number];
export const soundPath=(id:AudioId):string=>`assets/audio/${id}.wav`;
