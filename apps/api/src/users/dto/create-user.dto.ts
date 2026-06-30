import { UserRole } from '@prisma/client';
import { CameraPermissionLevel } from '@prisma/client';
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  // Sem política de senha forte (por escolha do operador). Piso mínimo só para
  // evitar senha vazia/acidental.
  @IsString()
  @MinLength(4)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @IsOptional()
  @IsEnum(CameraPermissionLevel)
  permissionLevel?: CameraPermissionLevel;
}
