/**
 * Are the controls for tuning a fold's look by hand in, `engine/foldtune.ts`?
 * The build defines it false, so the package has none of them. From source it
 * is not defined at all, and every guard reads that as true.
 */
declare const DEVKNOBS_TUNE: boolean | undefined;
