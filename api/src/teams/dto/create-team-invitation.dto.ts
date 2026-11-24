import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeamInvitationDto {
  @IsEmail()
  @MaxLength(254)
  invitedEmail!: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  role?: 'ADMIN' | 'MEMBER';

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  inviteeUserId!: string;
}
