declare module 'lzma-native' {
  export function decompress(input: Buffer | Uint8Array | string): Promise<Buffer>;
  const lzma: {
    decompress: typeof decompress;
  };
  export = lzma;
}
