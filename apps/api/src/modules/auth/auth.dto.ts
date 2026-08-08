import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

const trimValue = ({ value }: { readonly value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

const normalizeEmail = ({ value }: { readonly value: unknown }): unknown =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({
    description: "The current password used to re-authenticate this active session.",
    format: "password",
    maxLength: 128,
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({
    description: "The replacement password. It is not trimmed or normalized.",
    format: "password",
    maxLength: 128,
    minLength: 12,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;

  @ApiProperty({
    description: "The replacement password repeated exactly for confirmation.",
    format: "password",
    maxLength: 128,
    minLength: 12,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPasswordConfirmation!: string;
}

export class ChangePasswordResponseDto {
  @ApiProperty({ description: "Whether the password was changed.", example: true })
  passwordChanged!: true;
}
