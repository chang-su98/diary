import { promises as fs } from "fs";
import path from "path";

// 파일 스토리지 추상화(Port). 어댑터를 교체해 로컬 디스크 ↔ 클라우드(R2/S3)를 갈아끼운다.
// 현재는 로컬 디스크 어댑터만 구현 — 배포(서버리스) 시 R2 어댑터를 추가하고 env로 전환한다.

export type StoredObject = { bytes: Buffer; contentType: string };

export interface Storage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

// 허용 이미지 타입 ↔ 확장자/콘텐츠타입 매핑
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

// data URL → 바이너리 버퍼 + 콘텐츠타입 + 확장자. 형식 불일치 시 null.
export function dataUrlToBuffer(
  dataUrl: string
): { buffer: Buffer; contentType: string; ext: string } | null {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1];
  const ext = EXT_BY_TYPE[contentType] ?? "jpg";
  return { buffer: Buffer.from(m[2], "base64"), contentType, ext };
}

function contentTypeFromKey(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// 로컬 디스크 어댑터 — dev/self-host용. root 아래에 key 경로대로 파일을 저장한다.
class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  // key 내 경로 탈출(..) 차단
  private resolve(key: string): string {
    const safe = path
      .normalize(key)
      .replace(/^([/\\]|\.\.([/\\]|$))+/, "");
    return path.join(this.root, safe);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const bytes = await fs.readFile(this.resolve(key));
      return { bytes, contentType: contentTypeFromKey(key) };
    } catch (error) {
      // 파일 없음 등은 null 로 처리(상위에서 404)
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

let instance: Storage | null = null;

// 환경에 맞는 스토리지 어댑터(싱글톤). STORAGE_DRIVER 미설정 시 local.
export function getStorage(): Storage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    const root =
      process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), ".storage");
    instance = new LocalStorage(root);
    return instance;
  }
  // 배포 시: STORAGE_DRIVER=r2 + 자격증명 env로 R2/S3 어댑터를 여기에 추가한다.
  // (예: @aws-sdk/client-s3 기반 S3Storage)
  throw new Error(
    `지원하지 않는 STORAGE_DRIVER: ${driver} (현재 local만 구현됨)`
  );
}
