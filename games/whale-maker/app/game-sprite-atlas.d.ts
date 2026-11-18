declare module 'virtual:game-sprite-atlas' {
    interface PackedFrame {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly sourceSize?: readonly [number, number];
    }

    const atlas: {
        readonly url: string;
        readonly frames: Readonly<Record<string, PackedFrame>>;
        readonly frameCounts: Readonly<Record<string, number>>;
        readonly svg?: Readonly<Record<string, string>>;
    } | null;
    export default atlas;
}
