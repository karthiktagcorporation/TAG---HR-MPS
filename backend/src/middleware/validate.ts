import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError, z } from 'zod';
import { BadRequestError } from '../utils/errors';

interface Schemas {
  body?: AnyZodObject | z.ZodEffects<AnyZodObject>;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

/** Validates request body/query/params against Zod schemas and replaces them with parsed values. */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
        next(new BadRequestError('Validation failed', details));
        return;
      }
      next(err);
    }
  };
}
