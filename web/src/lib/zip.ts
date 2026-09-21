import { unzip, zip, type Unzipped } from "fflate";

type ZipFile = {
    name: string;
    data: BlobPart;
};

export async function createZip(files: ZipFile[]) {
    const entries = await Promise.all(
        files.map(async (file) => {
            const data = new Uint8Array(await new Blob([file.data]).arrayBuffer());
            return [file.name, data] as const;
        }),
    );
    const result = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => zip(Object.fromEntries(entries), { level: 0 }, (error, data) => (error ? reject(error) : resolve(data))));
    return new Blob([result], { type: "application/zip" });
}

export async function readZip(file: Blob) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = await new Promise<Unzipped>((resolve, reject) => unzip(bytes, (error, data) => (error ? reject(error) : resolve(data))));
    return new Map(Object.entries(entries).map(([name, data]) => [name, new Blob([data])]));
}
