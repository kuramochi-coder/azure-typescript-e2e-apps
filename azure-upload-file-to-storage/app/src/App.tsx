import { BlockBlobClient } from '@azure/storage-blob';
import { Box, Button, Card, CardMedia, Grid, Typography } from '@mui/material';
import { ChangeEvent, useState } from 'react';
import ErrorBoundary from './components/error-boundary';
import { convertFileToArrayBuffer } from './lib/convert-file-to-arraybuffer';

import axios, { AxiosResponse } from 'axios';
import './App.css';

// Used only for local development
const API_SERVER = import.meta.env.VITE_API_SERVER as string;
const VITE_API_SERVER_2 = import.meta.env.VITE_API_SERVER_2 as string; // python flask server
const CONTAINER_NAME = import.meta.env.VITE_CONTAINER_NAME as string;

const request = axios.create({
  baseURL: API_SERVER,
  headers: {
    'Content-type': 'application/json'
  }
});

// add another request for content type multipart/form-data
const requestFormData = axios.create({
  // The API server is pointing to a python flask server at port 8999
  baseURL: VITE_API_SERVER_2,
  headers: {
    'Content-type': 'multipart/form-data'
  }
});

type SasResponse = {
  url: string;
};
type ListResponse = {
  list: string[];
};

function App() {
  const containerName = CONTAINER_NAME;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sasTokenUrl, setSasTokenUrl] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [list, setList] = useState<string[]>([]);

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const { target } = event;

    if (!(target instanceof HTMLInputElement)) return;
    if (
      target?.files === null ||
      target?.files?.length === 0 ||
      target?.files[0] === null
    )
      return;

    setSelectedFile(target?.files[0]);

    // reset
    setSasTokenUrl('');
    setUploadStatus('');
  };

  const handleFileSasToken = () => {
    const permission = 'w'; //write
    const timerange = 5; //minutes

    if (!selectedFile) return;

    request
      .post(
        `/api/sas?file=${encodeURIComponent(
          selectedFile.name
        )}&permission=${permission}&container=${containerName}&timerange=${timerange}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
      .then((result: AxiosResponse<SasResponse>) => {
        const { data } = result;
        const { url } = data;
        setSasTokenUrl(url);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          const { message, stack } = error;
          setSasTokenUrl(`Error getting sas token: ${message} ${stack || ''}`);
        } else {
          setUploadStatus(error as string);
        }
      });
  };

  const handleFileUpload = () => {
    if (sasTokenUrl === '') return;

    convertFileToArrayBuffer(selectedFile as File)
      .then((fileArrayBuffer) => {
        if (
          fileArrayBuffer === null ||
          fileArrayBuffer.byteLength < 1 ||
          fileArrayBuffer.byteLength > 256000
        )
          return;

        const blockBlobClient = new BlockBlobClient(sasTokenUrl);
        return blockBlobClient.uploadData(fileArrayBuffer);
      })
      .then(() => {
        setUploadStatus('Successfully finished upload');
        return request.get(`/api/list?container=${containerName}`);
      })
      .then((result: AxiosResponse<ListResponse>) => {
        // Axios response
        const { data } = result;
        const { list } = data;
        setList(list);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          const { message, stack } = error;
          setUploadStatus(
            `Failed to finish upload with error : ${message} ${stack || ''}`
          );
        } else {
          setUploadStatus(error as string);
        }
      });
  };

  const handleFileUploadServerSide = () => {
    if (sasTokenUrl === '') return;
    // if selected file is empty or is missing name return
    if (!selectedFile || !selectedFile.name) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('sasTokenUrl', sasTokenUrl);

    // send file to server side along with sas token
    requestFormData
      .post(
        `/api/files`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      )
      .then(() => {
        setUploadStatus('Successfully finished upload');
        return request.get(`/api/list?container=${containerName}`);
      })
      .then((result: AxiosResponse<ListResponse>) => {
        // Axios response
        const { data } = result;
        const { list } = data;
        setList(list);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          const { message, stack } = error;
          setUploadStatus(
            `Failed to finish upload with error : ${message} ${stack || ''}`
          );
        } else {
          setUploadStatus(error as string);
        }
      });
  };

  return (
    <>
      <ErrorBoundary>
        <Box m={4}>
          {/* App Title */}
          <Typography variant="h4" gutterBottom>
            Upload file to Azure Storage
          </Typography>
          <Typography variant="h5" gutterBottom>
            with SAS token
          </Typography>
          <Typography variant="body1" gutterBottom>
            <b>Container: {containerName}</b>
          </Typography>

          {/* File Selection Section */}
          <Box
            display="block"
            justifyContent="left"
            alignItems="left"
            flexDirection="column"
            my={4}
          >
            <Button variant="contained" component="label">
              Select File
              <input type="file" hidden onChange={handleFileSelection} />
            </Button>
            {selectedFile && selectedFile.name && (
              <Box my={2}>
                <Typography variant="body2">{selectedFile.name}</Typography>
              </Box>
            )}
          </Box>

          {/* SAS Token Section */}
          {selectedFile && selectedFile.name && (
            <Box
              display="block"
              justifyContent="left"
              alignItems="left"
              flexDirection="column"
              my={4}
            >
              <Button variant="contained" onClick={handleFileSasToken}>
                Get SAS Token
              </Button>
              {sasTokenUrl && (
                <Box my={2}>
                  <Typography variant="body2">{sasTokenUrl}</Typography>
                </Box>
              )}
            </Box>
          )}

          {/* File Upload Section */}
          {sasTokenUrl && (
            <Box
              display="block"
              justifyContent="left"
              alignItems="left"
              flexDirection="column"
              my={4}
            >
              <Button variant="contained" onClick={handleFileUpload}>
                Upload
              </Button>
              <Button variant="contained" onClick={handleFileUploadServerSide}>
                Upload Server Side
              </Button>
              {uploadStatus && (
                <Box my={2}>
                  <Typography variant="body2" gutterBottom>
                    {uploadStatus}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Uploaded Files Display */}
          <Grid container spacing={2}>
            {list.map((item) => (
              <Grid item xs={6} sm={4} md={3} key={item}>
                <Card>
                  {item.endsWith('.jpg') ||
                  item.endsWith('.png') ||
                  item.endsWith('.jpeg') ||
                  item.endsWith('.gif') ? (
                    <CardMedia component="img" image={item} alt={item} />
                  ) : (
                    <Typography variant="body1" gutterBottom>
                      {item}
                    </Typography>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      </ErrorBoundary>
    </>
  );
}

export default App;
