import Versions from './components/Versions'
import { useEffect, useRef, useState } from 'react'
import { CircleAlertIcon, GripHorizontalIcon, GripVerticalIcon, XIcon } from 'lucide-react'

export interface LogType {
  id?: string,
  text: string,
  type?: string,
}

function App(): JSX.Element {
  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')
  const [logArray, setLogArray] = useState<LogType[]>([{
    text: 'Welcome to Quick Resume!!!',
    type: 'info',
    id: '0000'
  }])
  const logAreaRef = useRef<HTMLDivElement>(null)
  const [showCloseModal, setShowCloseModal] = useState('hide')
  const [generatedCount, setGeneratedCount] = useState(0)
  const [exportedCount, setExportedCount] = useState(0)

  useEffect(() => {
    window.electron.ipcRenderer.on('message', (event, arg) => {
      if (arg.text.match(/^Generated :/g)) setGeneratedCount(prev => prev + 1)
      if (arg.text.match(/^Exported :/g)) setExportedCount(prev => prev + 1)

      setLogArray((prev) => {
        const newArray = [...prev, {
          text: arg.text,
          type: arg.type,
          id: arg.id
        }]
        // return newArray.slice(-20)
        return newArray
      })
    })

    return () => {
      window.electron.ipcRenderer.removeAllListeners('message')
    }
  }, [])

  useEffect(() => {
    if (logAreaRef.current) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight
    }
  }, [logArray])

  const toggleCloseModal = () => {
    setShowCloseModal('hide')
    if (showCloseModal === 'hide') {
      setShowCloseModal('show')
    } else {
      setShowCloseModal('hide')
    }
  }

  const confimrClose = (confirm: boolean) => {
    if (confirm) {
      window.close()
    }
    setShowCloseModal('hide')
  }

  return (
    <>
      <div className="bg"></div>
      <div className='frame'>
        <span className='counts'>
          {exportedCount}
          /
          {generatedCount} (Host)
        </span>
        <GripHorizontalIcon className='move-icon' />
        <XIcon className='close-icon' onClick={toggleCloseModal} />
      </div>
      <div className='log-area' ref={logAreaRef}>
        {
          logArray.map((log, index) => (
            <div key={index}
              style={{
                color: (() => {
                  if (log.type?.includes('error')) return 'pink'
                  if (log.type?.includes('warning')) return 'yellow'
                  if (log.type?.includes('info')) return 'cyan'
                  if (log.type?.includes('success')) return 'lightgreen'
                  return 'white'
                })()
              }}
            >
              {log.text}
              {
                log.type?.includes('same-company') && !log.type?.includes('-remote') && <div className='confirmProceed'>
                  <button className='btn'
                    onClick={() => {
                      window.electron.ipcRenderer.send('proceed', log.id, true)
                      setLogArray((prev) => {
                        const newArray = prev.filter((item) => item.id !== log.id)
                        return newArray
                      })
                    }}
                  >Proceed</button>
                  <button className='btn'
                    onClick={() => {
                      window.electron.ipcRenderer.send('proceed', log.id, false)
                      setLogArray((prev) => {
                        const newArray = prev.filter((item) => item.id !== log.id)
                        return newArray
                      })
                    }}
                  >Cancel</button>
                </div>
              }
            </div>
          ))
        }
      </div>

      {/* Confirm Close Modal */}
      <div className={`modal ${showCloseModal}`}>
        <div className='modal-content'>
          <div className='modal-header'>
            <CircleAlertIcon size={50} />
          </div>
          <div className='modal-body'>
            <p>Are you sure to close?</p>
          </div>
          <div className='modal-footer'>
            <button className='btn' onClick={() => confimrClose(true)}>Yes</button>
            <button className='btn' onClick={() => confimrClose(false)}>No</button>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
