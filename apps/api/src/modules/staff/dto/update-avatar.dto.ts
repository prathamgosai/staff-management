import { IsString, MaxLength, Matches } from "class-validator";

export class UpdateAvatarDto {
  /**
   * Base64 image data URL (jpeg/png/webp/gif) to set as the avatar,
   * or an empty string to remove the current photo.
   */
  @IsString()
  @MaxLength(8_000_000, { message: "Image is too large" })
  @Matches(/^$|^data:image\/(png|jpe?g|webp|gif);base64,/, {
    message: "avatarUrl must be an image data URL",
  })
  avatarUrl!: string;
}
