import { ZipArchive, ZipEntry } from "@shortercode/webzip";
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { useEffect, useState } from 'react';
import { CSVLink } from "react-csv";


async function process(apk: FileList, dlens: FileList): Promise<any[]> {
  const sqlite3 = await sqlite3InitModule({
    print: (...args: any) => console.log(...args),
    printErr: (...args: any) => console.error(...args),
  });
  const db = new sqlite3.oo1.DB();
  const cardMap = await getApkCardTable(apk, sqlite3, db);
  const scannedCards = await getScannedCards(dlens, sqlite3, db);
  const result = scannedCards.map((card: any) => {
    return { ...card, name: cardMap[card.card] }
  });
  console.log(result);
  return result;
}

async function getScannedCards(dlens: FileList, sqlite3: any, db: any) {
  const buffer = await dlens[0].arrayBuffer();
  const rc = sqlite3.capi.sqlite3_deserialize(
    db.pointer,
    'main',
    sqlite3.wasm.allocFromTypedArray(new Uint8Array(buffer)),
    buffer.byteLength,
    buffer.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
  );

  return db.exec([
    "SELECT * FROM cards"
  ], {
    returnValue: "resultRows",
    rowMode: "object"
  });
}

// Returns a mapping of card IDs to card names
async function getApkCardTable(apk: FileList, sqlite3: any, db: any) {

  const apkArchive = await ZipArchive.from_blob(apk[0]);
  const iterator:Iterator<[file_name: string, entry: ZipEntry]> = apkArchive.files();
  let dbFileEntry:any = null;

  let currentFile:IteratorResult<[file_name: string, entry: ZipEntry], any> = iterator.next();

  while(!currentFile.done && currentFile !== null)
  {
    const filename:string = currentFile.value[0];

    if(filename.endsWith(".db")) 
    {
      dbFileEntry = currentFile.value[1];
      break;
    }
    currentFile = iterator.next();
  }

  dbFileEntry = false;

  if (!dbFileEntry) {
    alert("The provided APK file did not contain any *.db file");
    throw new Error("Couldn't find any .db file in the APK");
  }

  const databaseBuffer = await dbFileEntry.get_array_buffer();

  if (!databaseBuffer) {
    alert("Couldn't read the database file from the APK");
    throw new Error("Couldn't read the database file from the APK");
  }
  const rc = sqlite3.capi.sqlite3_deserialize(
    db.pointer,
    'main',
    sqlite3.wasm.allocFromTypedArray(new Uint8Array(databaseBuffer)),
    databaseBuffer.byteLength,
    databaseBuffer.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
  );

  const rows = db.exec([
    "SELECT cards._id, names.name FROM cards JOIN names ON cards.name = names._id;"
  ], {
    returnValue: "resultRows"
  });

  return Object.fromEntries(rows);
}

function App() {
  const [apk, setApk] = useState<FileList>();
  const [dlens, setDlens] = useState<FileList>();
  const [csvData, setCsvData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Whenever a file changes, invalidate the CSV
  useEffect(() => {
    setCsvData(null);
  }, [apk, dlens])

  useEffect(() => {
    if (apk && dlens && (!csvData)) {
      setLoading(true);
      const csv = process(apk, dlens).then(data => {
        setCsvData(data);
        setLoading(false);
      });
    }
  }, [apk, dlens, csvData])

  return (
    <form style={{
      display: 'flex',
      flexDirection: 'column',
      maxWidth: "500px",
      marginLeft: "auto",
      marginRight: "auto"
    }}>
      <label>APK</label>
      <input
        type="file"
        accept=".apk"
        onChange={e => {
          if (e.target.files) {
            setApk(e.target.files)
          }
        }
        } />
      <label>dlens File</label>
      <input
        type="file"
        accept=".dlens"
        onChange={e => {
          if (e.target.files) {
            setDlens(e.target.files)
          }
        }
        }
      />
      {loading && "Loading, please wait!"}
      {csvData && <CSVLink data={csvData} filename="cards.csv">Download me</CSVLink>}
    </form>
  );
}

export default App;
