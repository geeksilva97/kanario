import { KanarioError } from "./kanario-error.ts";

export type FileErrorMeta = {
  imagePath?: string;
};

export class FileError extends KanarioError<FileErrorMeta> {
  static is(err: unknown): err is FileError {
    return err instanceof FileError;
  }

  static imageNotFound(imagePath: string) {
    return new FileError(
      "image_not_found",
      `Image not found: ${imagePath}`,
      { imagePath },
    );
  }
}
