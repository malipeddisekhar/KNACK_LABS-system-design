import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { normalizeAllowedLongUrl } from '../url-policy';

@ValidatorConstraint({ name: 'safeLongUrl', async: false })
export class SafeLongUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return normalizeAllowedLongUrl(value) !== null;
  }

  defaultMessage(): string {
    return 'long_url must be an absolute HTTP or HTTPS URL without control characters, backslashes, or credentials.';
  }
}
