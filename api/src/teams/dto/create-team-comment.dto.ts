import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTeamCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}
