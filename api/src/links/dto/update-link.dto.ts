import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
} from 'class-validator';
import { SafeLongUrlConstraint } from './safe-long-url.constraint.js';

export class UpdateLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Validate(SafeLongUrlConstraint)
  long_url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];
}

