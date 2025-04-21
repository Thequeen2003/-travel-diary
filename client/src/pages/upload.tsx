import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { X, Camera, MapPin } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { uploadImage } from '@/lib/supabase';
import { insertEntrySchema } from '@shared/schema';

// Extend the schema with validation
const uploadFormSchema = insertEntrySchema.extend({
  captionText: z.string().min(3, { message: 'Caption must be at least 3 characters long' }),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

export default function Upload() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const screenInfo = {
    width: window.innerWidth,
    height: window.innerHeight,
    orientation: window.screen.orientation?.type.includes('portrait') ? 'Portrait' : 'Landscape'
  };

  // Form setup
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      captionText: '',
      userId: user?.id || '',
      imageUrl: '',
      location: null,
      screenInfo
    },
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Mutation for creating entry
  const createEntryMutation = useMutation({
    mutationFn: async (data: UploadFormValues) => {
      return await apiRequest('POST', '/api/entries', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/entries'] });
      toast({
        title: 'Success!',
        description: 'Your diary entry has been created.',
      });
      navigate('/dashboard');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to create entry: ${error.message}`,
        variant: 'destructive',
      });
    }
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(objectUrl);
      setShowCamera(false);
    }
  };

  const removeImage = () => {
    setPreviewUrl(null);
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getLocation = () => {
    setIsGettingLocation(true);
    
    // Check if running on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Log debug info
    console.log('Device details:', {
      userAgent: navigator.userAgent,
      isMobile,
      hasGeolocation: !!navigator.geolocation
    });
    
    if (navigator.geolocation) {
      // Set options for geolocation request
      const options = {
        enableHighAccuracy: true,    // Get the best possible result
        timeout: isMobile ? 20000 : 10000,  // Longer timeout for mobile devices
        maximumAge: 0                // Don't use cached position
      };
      
      toast({
        title: 'Getting Location',
        description: 'Please wait while we find your location...',
        duration: 3000
      });
      
      // Try to get location
      navigator.geolocation.getCurrentPosition(
        // Success callback
        (position) => {
          console.log('Location success:', position.coords);
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setLocation(newLocation);
          form.setValue('location', newLocation);
          setIsGettingLocation(false);
          
          toast({
            title: 'Location Found',
            description: 'Successfully captured your current location.',
          });
        },
        // Error callback with specific error messages and retry advice
        (error) => {
          console.error('Error getting location:', error);
          let errorMessage = 'Unable to get your current location.';
          let helpMessage = '';
          
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission was denied.';
              helpMessage = 'Please check your browser or device settings and enable location services.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.';
              helpMessage = isMobile ? 
                'Try these steps: 1) Go outdoors for better GPS signal, 2) Turn on "High accuracy" mode in your location settings, 3) Ensure any battery saver mode is off.' :
                'Please try again or consider entering your location manually.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out.';
              helpMessage = 'Please try again in an area with better signal, or check if your GPS is enabled.';
              break;
          }
          
          toast({
            title: 'Location Error',
            description: `${errorMessage} ${helpMessage}`,
            variant: 'destructive',
            duration: 7000
          });
          setIsGettingLocation(false);
        },
        // Options
        options
      );
    } else {
      toast({
        title: 'Location Not Supported',
        description: 'Geolocation is not supported by your browser or device.',
        variant: 'destructive',
      });
      setIsGettingLocation(false);
    }
  };

  const openCamera = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(mediaStream);
        setShowCamera(true);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } else {
        toast({
          title: 'Camera Error',
          description: 'Camera access is not supported by your browser.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Camera Error',
        description: 'Unable to access your camera.',
        variant: 'destructive',
      });
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to blob
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
          setFile(file);
          const objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
          setShowCamera(false);
          
          // Stop the camera stream
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
          }
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const onSubmit = async (data: UploadFormValues) => {
    if (!file) {
      toast({
        title: 'Missing Image',
        description: 'Please upload an image or take a photo.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to create an entry.',
        variant: 'destructive',
      });
      return;
    }

    // Upload image to Supabase Storage
    const imageUrl = await uploadImage(file, user.id);
    
    if (!imageUrl) {
      toast({
        title: 'Upload Error',
        description: 'Failed to upload image. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    const entryData: UploadFormValues = {
      ...data,
      userId: user.id,
      imageUrl,
      caption: data.captionText,
      location: location,
      screenInfo
    };

    // Create diary entry
    createEntryMutation.mutate(entryData);
  };

  if (!user) {
    return <div className="flex justify-center items-center min-h-screen">Redirecting...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header showAuthButtons={false} />
      
      <main className="flex-grow">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center mb-6">
            <Button 
              variant="ghost" 
              size="sm" 
              className="mr-2"
              onClick={() => navigate('/dashboard')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Button>
            <h1 className="text-xl font-semibold text-gray-900">Create New Entry</h1>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-md p-6">
              {/* Photo Upload */}
              <div className="mb-6">
                <FormLabel className="block text-sm font-medium text-gray-700 mb-2">Photo</FormLabel>
                
                {/* Camera Capture UI */}
                {showCamera && (
                  <div className="relative mb-4 rounded-lg overflow-hidden">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-64 object-cover rounded-lg"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute bottom-4 inset-x-0 flex justify-center space-x-4">
                      <Button 
                        type="button" 
                        onClick={capturePhoto} 
                        variant="secondary"
                        className="rounded-full w-12 h-12 flex items-center justify-center p-0 bg-white"
                      >
                        <Camera className="h-6 w-6" />
                      </Button>
                      <Button 
                        type="button" 
                        onClick={closeCamera} 
                        variant="destructive"
                        className="rounded-full w-12 h-12 flex items-center justify-center p-0"
                      >
                        <X className="h-6 w-6" />
                      </Button>
                    </div>
                  </div>
                )}
                
                {!showCamera && !previewUrl && (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      id="photo-upload" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleImageSelect}
                    />
                    <div className="space-y-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                      </svg>
                      <div className="flex text-sm text-gray-600 justify-center">
                        <label htmlFor="photo-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-primary hover:text-primary/90 focus-within:outline-none">
                          <span>Upload a file</span>
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                    </div>
                    <Button 
                      type="button" 
                      variant="link" 
                      onClick={openCamera} 
                      className="mt-4 flex items-center justify-center text-sm font-medium text-primary hover:text-primary/90 mx-auto"
                    >
                      <Camera className="h-5 w-5 mr-1" />
                      Take a photo instead
                    </Button>
                  </div>
                )}
                
                {previewUrl && (
                  <div className="mt-2 relative">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="w-full h-64 object-cover rounded-lg" 
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={removeImage}
                      className="absolute top-2 right-2 rounded-full w-8 h-8 p-1"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Caption */}
              <FormField
                control={form.control}
                name="captionText"
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel>Caption</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe this moment..." 
                        className="resize-none" 
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Location */}
              <div className="mb-6">
                <FormLabel className="block text-sm font-medium text-gray-700 mb-2">Location</FormLabel>
                {!location ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex items-center justify-center w-full border-gray-300"
                    onClick={getLocation}
                    disabled={isGettingLocation}
                  >
                    {isGettingLocation ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Getting location...
                      </span>
                    ) : (
                      <>
                        <MapPin className="h-5 w-5 mr-1" />
                        Get Current Location
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="bg-gray-50 p-3 rounded-md flex items-start">
                    <MapPin className="h-5 w-5 text-gray-500 mr-2 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Current Location</p>
                      <p className="text-xs text-gray-500">Lat: {location.lat.toFixed(6)}, Long: {location.lng.toFixed(6)}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Device Information */}
              <div className="mb-6">
                <FormLabel className="block text-sm font-medium text-gray-700 mb-2">Device Information</FormLabel>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500">Screen Width</p>
                      <p className="text-sm font-medium text-gray-700">{screenInfo.width}px</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Screen Height</p>
                      <p className="text-sm font-medium text-gray-700">{screenInfo.height}px</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Orientation</p>
                      <p className="text-sm font-medium text-gray-700">{screenInfo.orientation}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Time</p>
                      <p className="text-sm font-medium text-gray-700">
                        {new Date().toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Submit Buttons */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="mr-3"
                  onClick={() => navigate('/dashboard')}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-primary hover:bg-primary/90"
                  disabled={createEntryMutation.isPending}
                >
                  {createEntryMutation.isPending ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    'Save Entry'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </main>
    </div>
  );
}

