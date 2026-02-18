import { z } from 'zod';

export const frontmatterSchema = z.record(z.string(), z.unknown());
