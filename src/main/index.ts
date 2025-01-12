/* eslint-disable @typescript-eslint/explicit-function-return-type */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { app, shell, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, screen } from 'electron'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import OpenAI from 'openai'
import { z as zod } from 'zod'
import fs from 'fs'
import path from 'path'
import { getText } from '@one-lang/get-selected-text'
import { GlobalKeyboardListener } from 'node-global-key-listener'
import PizZip from 'pizzip'
import { exec } from 'child_process'
import { zodResponseFormat } from 'openai/helpers/zod'
import Docxtemplater from 'docxtemplater'
import notifier from 'node-notifier'
import { v4 as uuidv4 } from 'uuid'
// import dotenv from 'dotenv'
// dotenv.config()

// import iconImage from '../../resources/icon.png?asset'
import image from '../../resources/images.png?asset'
import LightCaution from '../../resources/LightCaution.png?asset'
import LightError from '../../resources/LightError.png?asset'
import LightSuccess from '../../resources/LightSuccess.png?asset'

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'))
const instructions = fs.readFileSync('instructions.txt', 'utf8').split('--------').filter((line) => line.trim().length > 0)

const globalKeyboardListener = new GlobalKeyboardListener()

interface ApplicationDataType {
  id?: string;
  jobDescription: string;
  resume: any;
}

let applications: ApplicationDataType[] = []

const generatedResumeExtracted = zod.object({
  companyName: zod.string(),
  roleTitle: zod.string(),
  developerTitle: zod.string(),
  summary: zod.string(),
  skills: zod.array(
    zod.object({
      group: zod.string(),
      keywords: zod.array(zod.string())
    })
  ),
  experience_first: zod.array(zod.string()),
  experience_second: zod.array(zod.string()),
  experience_third: zod.array(zod.string())
})

let mainWindow: BrowserWindow;

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 240,
    height: 300,
    // resizable: false,
    show: false,
    transparent: true,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    frame: false,
    ...(process.platform === 'linux' ? { image } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    x: screen.getPrimaryDisplay().workAreaSize.width - 240 - 1,
    y: 264,
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  // electronApp.setAppUserModelId('com.electron')

  // const gotTheLock = app.requestSingleInstanceLock()

  // if (!gotTheLock) {
  //   notifier.notify({
  //     title: 'Resume Generator',
  //     message: 'Another instance of the app is already running.',
  //     icon: LightCaution
  //   })
  //   app.quit()
  // }

  // notifier.notify({
  //   icon: LightCaution,
  //   title: 'Resume Generator',
  //   message: 'Ready to generate resumes.'
  // })

  // createWindow()
  setupGlobalKeyboardListener()

  logMessage('++++++ Resume writer is ready. ++++++')

  const tray = new Tray(image)

  const contextMenu = Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }])
  tray.setToolTip('Resume Generator')
  tray.setContextMenu(contextMenu)
  createWindow()
  // showNotification('Ready to generate resumes.')
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const openai = new OpenAI({
  dangerouslyAllowBrowser: true,
  apiKey: config.openApiKey
})

const generateResume = async (application, response?) => {

  applications.push(application)
  mainWindow.webContents.send('message', {
    id: application.id + '-selected',
    text: 'Selected : ' + application.jobDescription,
    type: 'selected-text'
  })

  const { id, jobDescription } = application
  const startTime = new Date().getTime()
  const completion = await openai.beta.chat.completions.parse({
    //model: "gpt-4o-2024-08-06",
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: "You are a resume generation expert for tailored job applications." },
      { role: 'user', content: jobDescription },
      ...(instructions || []).map((instruction) => ({ role: 'user' as const, content: instruction })),
    ],
    response_format: zodResponseFormat(generatedResumeExtracted, 'research_paper_extraction')
  })
  const endTime = new Date().getTime()
  mainWindow.webContents.send('message', {
    id: id + '-generated',
    text: `Generated : ${(endTime - startTime).toLocaleString()}ms`,
    type: 'success'
  })

  const outputDir = config.outputDir
  if (!outputDir) {
    notifier.notify({
      title: 'Resume Generator',
      message: 'Output directory is not defined.',
      icon: LightError
    })
    throw new Error('OUTPUT_DIR environment variable is not defined')
  }

  const resumeData = JSON.parse(completion.choices[0].message.content || '{}')
  const expectedFileName = formatString(
    config.outputFilename || '{0}-{1}',
    resumeData.roleTitle,
    resumeData.companyName
  )
  const filenames = fs.readdirSync(outputDir)
  let sameExists = false
  filenames.forEach((str) => {
    str = str.replace('.txt', '')
    str = str.split('-').pop() || str
    if (str === resumeData.companyName) {
      sameExists = true
    }
  })

  applications.forEach((app) => {
    if (app.id === id) {
      app.resume = resumeData
    }
  });

  if (sameExists) {
    mainWindow.webContents.send('message', {
      id: id + '-same-company',
      text: 'Conflict : ' + resumeData.companyName + ' / ' + resumeData.roleTitle,
      type: 'same-company-warning' + (response ? '-remote' : '')
    })
    if (response) {
      response.setHeader('company-name', resumeData.companyName)
      response.status(409).send({
        error: 'Conflict',
        message: `A resume for ${resumeData.companyName} already exists.`,
        companyName: resumeData.companyName,
      })
    }
  } else {
    exportResume(id, resumeData, expectedFileName, response)
    exportJobDescription(jobDescription, expectedFileName)
  }
}

ipcMain.on('proceed', (event, id, proceed) => {
  id = id.replace(/-same-company/g, '')
  const application = applications.find((app) => app.id === id)
  if (application && proceed) {
    const expectedFileName = formatString(
      config.outputFilename || '{0}-{1}',
      application.resume.roleTitle,
      application.resume.companyName
    )
    const newFileName = expectedFileName + '(' + Math.floor(Math.random() * 1000) + ')'
    exportResume(application.id, application.resume, newFileName)
    exportJobDescription(application.jobDescription, newFileName)
  }
});

ipcMain.on('minimize', () => {
  mainWindow.minimize()
})

const exportJobDescription = async (jobDescription, fileName) => {
  const outputDir = config.outputDir
  if (!outputDir) {
    throw new Error('OUTPUT_DIR environment variable is not defined')
  }
  fs.writeFileSync(path.resolve(outputDir, fileName + '.txt'), jobDescription)
}

const exportResume = async (id, resume, fileName, response?) => {
  try {
    const content = fs.readFileSync('template.docx', 'binary')
    const zip = new PizZip(content)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    })

    const options = {
      title: resume.developerTitle,
      lastJob: resume.roleTitle,
      summary: resume.summary.replace(/\*/g, ''),
      skills: resume.skills.map((skill) => ({
        group: skill.group,
        keywords: skill.keywords.join(', ').replace(/\*/g, '')
      })),
      bullets1: formatBullets(resume.experience_first),
      bullets2: formatBullets(resume.experience_second),
      bullets3: formatBullets(resume.experience_third)
    }

    doc.render(options)
    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    })

    const outputDir = config.outputDir
    if (!outputDir) {
      throw new Error('OUTPUT_DIR environment variable is not defined')
    }
    const outputPath = path.resolve(outputDir, fileName + '.docx')


    try {
      fs.writeFileSync(outputPath, buf)
      if (response) {
        response.setHeader('Content-Disposition', `attachment; filename="${fileName}.docx"`)
        response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        response.setHeader('save-filename', fileName + '.docx')

        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(response);
      } else {
        openFile(outputPath)
      }

      mainWindow.webContents.send('message', {
        id: id + '-exported',
        text: 'Exported : ' + resume.roleTitle + ' / ' + resume.companyName,
        type: 'success'
      })
    } catch (err) {
      logMessage(err)
      // notifier.notify({
      //   title: 'Resume Generator',
      //   message: err instanceof Error ? err.message : 'Unknown error'
      // })
      mainWindow.webContents.send('message', {
        id: id + '-exported',
        text: err instanceof Error ? err.message : 'Unknown error',
        type: 'error'
      })

      if (response) {
        response.status(500).send({
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }
  } catch (err) {
    logMessage(err)
    mainWindow.webContents.send('message', {
      id: id + '-exported',
      text: err instanceof Error ? err.message : 'Unknown error',
      type: 'error'
    })

    if (response) {
      response.status(500).send({
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }
}

function formatString(template, ...args) {
  args = args.map((arg) => {
    arg = arg.replace(/\/|\\|:|\*|\?|"|<|>|\||-/g, '_')
    return arg
  })
  return template.replace(/{(\d+)}/g, (match, index) => args[index] || '')
}

const formatBullets = (bulletsArray) => {
  return bulletsArray.map((bullet) => {
    const words = bullet.split('**')
    const segments = words.map((word, index) => ({
      bold: index % 2 == 1 ? word : '',
      plain: index % 2 == 0 ? word : ''
    }))
    return { bullet: segments }
  })
}

const setupGlobalKeyboardListener = () => {
  globalKeyboardListener.addListener(function (e, down) {
    if (e.state == 'DOWN' && e.name == 'SPACE' && down['LEFT CTRL']) {
      getText()
        .then((jobDescription) => {
          if (!jobDescription) {
            throw new Error('No text selected')
          }
          // notifier.notify({
          //   title: 'Generating resume...',
          //   message: jobDescription
          // })
          const application: ApplicationDataType = {
            id: uuidv4(),
            jobDescription,
            resume: null
          }
          generateResume(application)
        })
        .catch((err) => {
          // notifier.notify({
          //   icon: LightError,
          //   title: 'Resume Generator',
          //   message: err.message
          // })
          mainWindow.webContents.send('message', {
            id: uuidv4(),
            text: err.message,
            type: 'selected-text-error'
          })
          logMessage(err)
        })
    }
  })
}

const openFile = (filePath) => {
  switch (process.platform) {
    case 'darwin':
      exec(`open "${filePath}"`)
      break
    case 'win32':
      exec(`start "" "${filePath}"`, { windowsHide: false })
      break
    default:
      exec(`xdg-open "${filePath}"`)
  }
}

const logMessage = (message) => {
  const logFilePath = path.join('app.log')
  const logEntry = `${new Date().toISOString()} - ${message}\n`
  fs.appendFileSync(logFilePath, logEntry)
}

// require('electron-reload')(__dirname, {
//   electron: require(`${__dirname}/node_modules/electron`)
// });

import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
const appExpress = express()
appExpress.use(bodyParser.json())
const port = config.port || 3000;

appExpress.post('/indeed-extension', async (req, res) => {
  const jobText = 'Job Title: ' + req.body.jobTitle + '\n\n' +
    'Company Name: ' + req.body.companyName + '\n\n' +
    'Location: ' + req.body.companyLocation + '\n\n' +
    'Job Details: ' + req.body.jobDetails + '\n\n' +
    'Job Description: ' + req.body.jobDescription + '\n\n'
  await generateResume({ id: uuidv4(), jobDescription: jobText })
  res.send('Resume generated successfully')
});

appExpress.post('/generate', (req, res) => {
  mainWindow.webContents.send('message', {
    id: uuidv4(),
    text: 'Bidder IP : ' + req.ip.replace('::ffff:', ''),
    type: 'info'
  })
  generateResume(req.body, res)
})

appExpress.get('/proceed', (req, res) => {
  const { id } = req.query
  const application = applications.find((app) => app.id === id)
  if (application) {
    const expectedFileName = formatString(
      config.outputFilename || '{0}-{1}',
      application.resume.roleTitle,
      application.resume.companyName
    )
    const newFileName = expectedFileName + '(' + Math.floor(Math.random() * 1000) + ')'
    exportResume(application.id, application.resume, newFileName, res)
  }
})

appExpress.use(cors())

const companyNames = fs.readdirSync(config.outputDir).map((file) => file.replace('.txt', '').replace(/\(.*\)/g, '').split('-').pop())

appExpress.get('/company-names', (req, res) => {
  console.log('company-names')
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  mainWindow.webContents.send('message', {
    id: uuidv4(),
    text: 'Requested company names: ' + companyNames.length + ' names sent.',
    type: 'info'
  })

  companyNames.forEach((companyName) => {
    res.write(`data: ${companyName}\n\n`);
  });

  fs.watch(config.outputDir, (eventType, filename) => {
    if (filename && filename.endsWith('.txt')) {
      const companyName = filename.split('-').pop().replace('.txt', '').replace(/\(.*\)/g, '');

      if (!companyNames.includes(companyName)) {
        companyNames.push(companyName)
        res.write(`data: ${companyName}\n\n`);
        mainWindow.webContents.send('message', {
          id: uuidv4(),
          text: 'New company name found : ' + companyName,
          type: 'info'
        })
      }
    }
  });
});

appExpress.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
