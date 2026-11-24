import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AcceptTeamInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
