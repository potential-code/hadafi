import { z } from "zod";

/**
 * True for https:// addresses only. zod's .url() also accepts `javascript:`,
 * `data:` and other schemes, which turn a saved link into script once it is
 * rendered as an <a href> (a profile page, an admin list, an email); plain
 * http:// links are refused too, so every saved link is encrypted.
 */
export const isHttpsUrl = (value: string) => /^https:\/\/[^\s/?#]+[^\s]*$/i.test(value);

/** A web address that users can save: a valid URL starting with https://. */
export const httpsUrl = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .url("Must be a valid URL")
    .refine(isHttpsUrl, "Use a link starting with https://");
