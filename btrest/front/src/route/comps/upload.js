import useFetch from './fech';
import Cookies from 'universal-cookie';
import { useState ,useEffect} from 'react';
export default  function Post(){
    const cookies = new Cookies();
    const [h, seth] = useState('');
    const user_id = cookies.get('user_id');
    const {data,loading,error} =  useFetch('http://127.0.0.1:5000/profile?'+user_id)
    const [selectedFile, setSelectedFile] = useState()
    const [preview, setPreview] = useState()

    // create a preview as a side effect, whenever selected file is changed
    useEffect(() => {
        if (!selectedFile) {
            setPreview(undefined)
            return
        }

        const objectUrl = URL.createObjectURL(selectedFile)
        setPreview(objectUrl)

        // free memory when ever this component is unmounted
        return () => URL.revokeObjectURL(objectUrl)
    }, [selectedFile])

    const onSelectFile = e => {
        if (!e.target.files || e.target.files.length === 0) {
            setSelectedFile(undefined)
            return
        }

        // I've kept this example simple by using the first image instead of multiple
        setSelectedFile(e.target.files[0])
        seth("hidden")
    }

    return(
    <div className='flex justify-center'>
        <div className='rounded-xl p-6 w-11/12 bg-[#121212] h-9/12  flex-col content-center justify-center'>
            <form method="POST" action='http://127.0.0.1:5000/upload/post'enctype="multipart/form-data">
            
            <div className='flex justify-center p-6 border-dashed border '>
                    <input value={user_id} type="hidden" name="user_id"></input>
                    
                    <div className={''}>
                        <div className=" p-4 flex justify-center items-center w-full">
                             <label for="dropzone-file" class={"flex flex-col justify-center items-center w-full bg-zinc-900 rounded-lg border-2 p-8 hover:bg-zinc-800 "+h}>
                             <div class=" w-48 flex flex-col justify-center items-center pt-5 pb-6">
                                 <svg aria-hidden="true" class="mb-3 w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                 <p class="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                    Click to upload
                                 </p>
                                 <p class="text-xs text-gray-500 dark:text-gray-400">SVG, PNG, JPG or GIF</p>
                             </div>

                             <input required id="dropzone-file" type="file" name='pic' class="hidden" onChange={onSelectFile}/>
                            
                            </label>
                        </div> 
                        <div className="w-96 p-4 object-cover">
                            <img src={preview} className={'rounded-xl m-3'} />
                            {preview &&    
                                 <svg >
                                        <path onClick={(e) => {setSelectedFile(undefined) ;seth("")}}  className='invert cursor-pointer' d="M4.878 22.116A2 2 0 0 0 6.875 24h10.229a2 2 0 0 0 1.995-1.881L20 7H4l.88 15.116zM22 3.5A1.5 1.5 0 0 1 20.5 5h-17a1.5 1.5 0 0 1 0-3h6V1a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1h6A1.5 1.5 0 0 1 22 3.5z"></path>
                                </svg>}
                        </div>
                        
                    </div>
                    
                    <div className='p-4 m-3 w-2/3'>
                        <input name='title' className='mb-4 bg-transparent text-stone-100 font-mont font-extrabold text-3xl border-b-2 w-full border-zinc-400' type='text'placeholder='Add your title'/>
                            {data && 
                            <div id='account' className='flex m-2'>
                            <a href={'/'+data[0].username} className="flex p-1 bg-[#2b2b2b] rounded-lg w-1/2">    
                                <img src={data[0].pfp} className=" rounded-full mx-2 w-11 h-11"/>
                                <span className="text-center p-2 text-slate-300"> {data[0].username}</span>
                            </a>
                            </div>
                            }
                        <input type='text' name='about' placeholder='Tell everyone whats your Pin is about' className=' mb-4 bg-transparent font-mont font-normal text-sm border-b-2 w-full border-zinc-400' />
                        <button className='rounded-xl' placeholder='Add alt text'></button>
                    </div>
            </div>
            <div className='flex justify-center'>
            <button type='submit' className='bg-gray-400 text-black rounded-lg p-2 m-2 h-10'>submit</button>
            </div>
            </form>

    </div>
</div>
    );
}