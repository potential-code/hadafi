import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/**
 * Express middleware factory that validates `req.body` against a Zod schema.
 *
 * On success, `req.body` is replaced with the parsed (and coerced) output so
 * that downstream handlers receive clean, typed data (e.g. trimmed strings,
 * lowercased email).
 *
 * On failure, responds immediately with HTTP 422 and a structured error body
 * listing per-field validation errors — the request never reaches the controller.
 *
 * @param schema - Any Zod schema whose input type matches the expected request body shape
 * @returns Express middleware function
 *
 * @example
 * router.post("/register", validate(registerDto), authController.register);
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      res.status(422).json({
        success: false,
        error: { message: "Validation failed", code: "VALIDATION_ERROR", errors },
      });
      return;
    }
    // Replace body with coerced/sanitised data (trimmed strings, lowercased email, etc.)
    req.body = result.data;
    next();
  };
}
