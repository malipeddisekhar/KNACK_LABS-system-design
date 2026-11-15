import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
} from 'class-validator';
import { FutureDateConstraint } from './future-date.constraint';
import { SafeLongUrlConstraint } from './safe-long-url.constraint';

export class CreateLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @Validate(SafeLongUrlConstraint)
  long_url!: string;

  @IsOptional()
  @IsString()
  @IsDateString({ strict: true })
  @Validate(FutureDateConstraint)
  expires_at?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];
}
