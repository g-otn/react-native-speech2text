import React, { Component } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  ScrollView,
  View,
  Text,
  Switch,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { Picker } from '@react-native-community/picker';
import Slider from '@react-native-community/slider';
import CheckBox from '@react-native-community/checkbox';

import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Recorder, Player } from '@react-native-community/audio-toolkit';
import DocumentPicker from 'react-native-document-picker';
import * as RNFS from 'react-native-fs';

import { Consts } from './Consts';
import { Color } from './styles/Theme';

export default class App extends Component {
  player;
  currentTimeInterval;
  recorder;
  
  isAndroid = Platform.OS === 'android'
  languagesPickerItems = require('./data/languages.json').map(l => (<Picker.Item key={l.bcp47} label={l.name} value={l.bcp47} />));

  constructor(props) {
    super(props);

    this.state = {
      connectedWithBackend: false,

      // Player
      isPlaying: false, // MediaStates.PLAYING
      playerBusy: false, // MediaStates.PREPARING or MediaStates.SEEKING
      playerCurrentTimeAprox: null, // Updated through currentTimeTextUpdateInterval
      playerTimeText: '00:00:00',

      // Recorder
      isRecording: false, // MediaStates.RECORDING
      recorderBusy: false, // from MediaStates.PREPARING to MediaStates.RECORDING
      fileName: null,     // File name
      fileFullPath: null, // Current full path of recording file

      // File metadata and options
      audioSource: null, // 'file' || 'recorder'
      convertInBackend: this.isAndroid ? false : true,
      format: this.isAndroid ? 'amr' : 'mp4',
      duration: null, // Value received from Player to help determine if Google Storage upload is needed

      // Recognition options
      languageCode: 'pt-BR',
      profanityFilter: false,
      wordTimeOffset: true,
      wordConfidence: false,
      automaticPunctuation: false,
      model: 'default',
      enhancedModel: false,

      // Response
      isRecognizing: false, // Google Speech-to-Text API Request in progress
      recognitionAIText: '',
      responseBodyText: '',
      transcriptText: '',
    }
  }

  componentDidMount() {
    // this.connectWithBackend();
  }

  componentWillUnmount() {
    clearInterval(this.currentTimeInterval);
  }

  async connectWithBackend() {
    this.setState({ connectedWithBackend: false });
    console.info(`Checking backend status (${Consts.BACKEND_URL})`);
    return fetch(`${Consts.BACKEND_URL}/status`)
      .then(response => { 
        this.setState({ connectedWithBackend: response.ok });
        // if (this.state.connectedWithBackend) Alert.alert('Connected with backend', 'Successfully connected with backend, you can now use more audio formats.');
      })
      .catch(err => {
        console.error('Error accessing backend:', err);
        this.setState({ connectedWithBackend: false });
      })
  }

  canLoadPlayer() {
    return !this.state.isRecording && !!this.state.fileFullPath && !this.state.playerBusy;
  }

  canSendAudio() { // Not recording and has selected file
    return !this.state.isRecording && !this.state.recorderBusy && !!this.state.fileFullPath && !this.state.isRecognizing;
  }

  async doSpeechToText() {
    if (!this.canSendAudio()) return;

    this.setState({ 
      isRecognizing: true, 
      recognitionAIText: 'Reading file from device',
      responseBodyText: '',
      transcriptText: ''
    });

    // Read file bytes and encode in base64
    let fileBase64 = '';
    await RNFS.readFile(this.state.fileFullPath, 'base64')
      .then(data => { fileBase64 = data });
    console.info('File loaded. Base64 length:', fileBase64.length);

    // Create request body
    const audio = {
      content: fileBase64
    };
    const config = {
      encoding: 'AMR_WB',
      languageCode: this.state.languageCode,
      sampleRateHertz: this.state.format === 'amr' ? 16000 : 44100,

      profanityFilter: this.state.profanityFilter,
      enableWordTimeOffsets: this.state.wordTimeOffset,
      enableWordConfidence: this.state.wordConfidence,
      enableAutomaticPunctuation: this.state.automaticPunctuation,
      model: this.state.model,
      useEnhanced: this.state.useEnhanced
    };
    console.info('RecognitionConfig:\n' + JSON.stringify(config, null, '  '));

    // Send request to Google Cloud Speech-to-Text API
    this.setState({ recognitionAIText: 'Sending audio to API' });
    await fetch(`https://content-speech.googleapis.com/v1p1beta1/speech:recognize?key=${Consts.GOOGLE_CLOUD_API_KEY}`, {
      method: 'POST',
      body: JSON.stringify({ audio, config })
    })
      .then(async response => {
        if (response.ok) {
          const data = await response.json(); // Response body
          console.info('responseBody:\n' + JSON.stringify(data, null, '  '));
          this.setState({ 
            transcriptText: data.results[0].alternatives[0].transcript,
            responseBodyText: JSON.stringify(data, null, '\t') 
          });
        } else {
          console.warn('API response not ok:', response.status, response.statusText, response);
        }
      })
      .catch(err => {
        console.error('Error sending audio to API:', err);
      });

    this.setState({ isRecognizing: false })
  }

  resetAudioSource(newFormat) {
    this.setState({ 
      fileName: null, 
      fileFullPath: null, 
      format: newFormat,
      duration: null,
    });
  }
  
  getAvailableFormats() {
    /*
      Recorder formats notes
      mp4: AMR-NB (Adaptive Multi-Rate NarrowBand); 1 channel only?
      aac: AAC (Advanced Audio Coding)
      ogg:
      webm:
      amr: AMR-WB (Adaptive Multi-Rate WideBand); 1 channel only?
    */
    let availableFormats = []

    if (this.state.connectedWithBackend) {
      availableFormats.push(
        { value: 'mp4', label: 'mp4' },
        { value: 'aac', label: 'aac' },
      )
      if (this.isAndroid) {
        availableFormats.push(
          { value: 'ogg', label: 'ogg' },
          { value: 'webm', label: 'webm' },
          { value: 'amr', label: 'amr' },
        )
      }
    } else if (this.isAndroid) {
      availableFormats.push(
        { value: 'amr', label: 'amr' },
      )
    } // iOS must convert in server, no accepted formats by the API available in Recorder to be direcly sent

    return availableFormats;
  }

  getFileExtension() {
    return this.getAvailableFormats().filter(f => f.value === this.state.format)[0].label;
  }


  async requestWriteStoragePermission() {
    if (!this.isAndroid) return RESULTS.UNAVAILABLE;
    return await request(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE);
  }

  async requestReadStoragePermission() {
    if (!this.isAndroid) return RESULTS.UNAVAILABLE;
    return await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
  }

  async requestMicrophonePermission() {
    return await request(
      Platform.select({
        android: PERMISSIONS.ANDROID.RECORD_AUDIO,
        ios: PERMISSIONS.IOS.MICROPHONE,
      })
    );
  }

  async destroyPlayer() {
    if (this.player) {
      await new Promise((resolve, reject) => { 
        this.player.destroy(resolve);
      });
      this.player = null;
    }
  }

  async loadPlayer() {
    if (!this.canLoadPlayer()) return;
    this.setState({ 
      playerBusy: true,
      isPlaying: false,
      playerTimeText: '00:00:00',
      playerCurrentTimeAprox: 0,
    });
    
    clearInterval(this.currentTimeInterval);

    // Destroy previous player
    await this.destroyPlayer();


    // Initalize and prepare new player
    try {
      await new Promise((resolve, reject) => {

        this.player = new Player(this.state.fileFullPath, {
          autoDestroy: false,
          meteringInterval: 200
        });

        // Fix "playerId X not found" Android error when trying to play: https://github.com/react-native-community/react-native-audio-toolkit/issues/168
        if (this.isAndroid) this.player.speed = 0.0;
        
        this.player.prepare((err) => {
          if (err) {
            reject(err);
          } else {
            console.info('Prepared to play audio');
            resolve();
          }
        });

      });
    } catch (err) {
      console.error('Error preparing Player:', err);
      Alert.alert('Error while preparing audio player', err);
      return;
    }

    this.player.on('ended', () => { // Playback ended, Player now is MediaStates.PREPARED
      this.setState({ 
        isPlaying: false,
        // playerCurrentTimeAprox: 0
      });
    })

    this.setState({ 
      playerBusy: false, 
      duration: this.player.duration,
      playerCurrentTimeAprox: 0
    });

    this.currentTimeInterval = setInterval(() => {
      this.updatePlayerCurrentTimeText();
    }, 50)

    //this.updatePlayerCurrentTimeText();
  }

  updatePlayerCurrentTimeText() {
    if (!this.player || !this.canLoadPlayer()) return;

    // Get data from Player.currentTime and update state for visual components (slider and current time text)
    if (Math.abs(this.player.currentTime - this.state.playerCurrentTimeAprox) > 50) { // No need to update every time
      this.setState({
        playerCurrentTimeAprox: this.player.currentTime,
      });
    }
  }

  async togglePlayer() {
    if (!this.player || this.state.playerBusy) return;
    this.setState({ playerBusy: true });
    
    const isPaused = await new Promise((resolve, reject) => {
      this.player.playPause((err, paused) => { 
        err ? reject(err) : resolve(paused) 
      });
    })
    .catch(err => {
      console.error('Error toggling player:', err);
    });

    this.setState({ playerBusy: false, isPlaying: !isPaused });
  }

  async seekPlayer(position) {
    if (!this.player) return;
    this.setState({ playerBusy: true });

    position = Math.floor(position); // Slider returns decimal numbers

    await new Promise((reject, resolve) => {
      this.player.seek(position, err => { err ? reject(err) : resolve(err) });
    })
    .catch(err => {
      console.error('Error seeking current playing media:', err);
    });
    console.log('test')

    this.setState({ playerBusy: false });

    //this.updatePlayerCurrentTimeText();
  }

  async pausePlayer() {
    if (!this.player) return;
    this.setState({ playerBusy: true });

    await new Promise((resolve, reject) => {
      this.player.pause(resolve);
    });

    this.setState({ playerBusy: false });
  }

  getPlayerTime() {
    return this.player ? this.player.duration : 0;
  }

  async selectFile() { // Android only
    // Request permission to select file
    const permission = await this.requestReadStoragePermission();
    if (permission !== RESULTS.GRANTED) {
      return;
    }

    // Select file
    const availableTypes = this.getAvailableFormats().map(f => `audio/${f.value}`); // MIME types (for Android)
    console.info('Opening document picker with types:', availableTypes);
    let fileMetadata = {};
    try {
      fileMetadata = await DocumentPicker.pick({
        type: availableTypes,
      });
    } catch (err) {
      console.error('Error selecting file', err)
      return;
    }

    const fileFormat = fileMetadata.type.split('/')[1];
    this.setState({ 
      format: fileFormat, 
      fileName: fileMetadata.name, 
      fileFullPath: fileMetadata.uri,
      convertInBackend: this.requiresToConvertInBackend(fileFormat)
    });
    console.info('Selected file URI:', this.state.fileFullPath);

    // Load selected audio into player
    await this.loadPlayer();
  }

  async toggleVoiceRecording() {
    if (this.state.recorderBusy) return;

    this.setState({ recorderBusy: true });
    if (!this.state.isRecording) {
      await this.startRecording();
    } else {
      await this.stopRecording();
    }
    this.setState({ recorderBusy: false });
  }

  async startRecording() {
    // Request permissions to use mic and write audio file
    const microphonePermission = await this.requestMicrophonePermission();
    const writeStoragePermission = await this.requestWriteStoragePermission();
    if (microphonePermission !== RESULTS.GRANTED || (this.isAndroid && writeStoragePermission !== RESULTS.GRANTED)) {
      return;
    }

    // Generate file names and prepare Recorder
    const fileName = `S2T_${new Date().toISOString().replace(/[-:]/g, '').replace(/[T\.]/g, '_').slice(0, -5)}.${this.getFileExtension()}`;
    const fileRelativePath = `${fileName}`; // Relative to app 'personal' folder
    console.info(`Recording ${this.state.format} audio in relative path:`, fileRelativePath);
    try {
      await new Promise((resolve, reject) => {

        this.recorder = new Recorder(fileRelativePath, { // Parent folders must exist
          bitrate: 256000,
          channels: 2,
          format: this.state.format,
          sampleRate: this.state.format === 'amr' ? 16000 : 44100,
          meteringInterval: 1000
        }).prepare((err, fsPath) => {
          if (err) {
            reject(err);
            return;
          }
          console.info('Prepared to record at:', fsPath);
          this.setState({ fileName, fileFullPath: fsPath });
          resolve();
        });

      });
    } catch (err) {
      console.error('Error preparing Recorder:', err);
      Alert.alert('Error while preparing to record', err);
      return;
    }

    // Set meter event handler to update counter
    // this.setState({ currentTime: 0 });
    // this.recorder.on('meter', data => { // Event not firing for some reason
    //   console.log(data);
    //   this.setState({ currentTime: this.state.currentTime + 1 });
    // });

    // Start recording
    this.setState({ isRecording: true });
    try {
      await new Promise((resolve, reject) => {
        
        this.recorder.record(err => {
          if (err) {
            reject(err);
            return;
          }
          console.info('Recording started');
          resolve();
        });

      });
    } catch (err) {
      console.error('Error while recording:', err);
      Alert.alert('Error while recording', err);
      this.setState({ isRecording: false });
      return;
    }
  }

  async stopRecording() {
    // Stop recording
    try {
      await new Promise((resolve, reject) => {

        this.recorder.stop(err => {
          if (err) {
            reject(err);
            return;
          }
          console.info('Recording stopped');
          resolve();
        });

      });
    } catch (err) {
      console.error('Error while stopping to record:', err);
      Alert.alert('Error while stopping to record', err);
      this.setState({ isRecording: false });
      return;
    }

    // Copy file to external directory
    if (this.isAndroid) {
      try {
        const recordingsExternalFolderPath = `${RNFS.ExternalStorageDirectoryPath}/Speech2Text`;
        await RNFS.mkdir(recordingsExternalFolderPath); // Create directory if it doesn't exist yet
  
        // Move file to acessible external folder
        const fileExternalFullPath = `${recordingsExternalFolderPath}/${this.state.fileName}`;
        console.info('Moving file\n from:', this.state.fileFullPath, '\n to:', fileExternalFullPath);
        await RNFS.moveFile(this.state.fileFullPath, fileExternalFullPath);
        this.setState({ fileFullPath: fileExternalFullPath });
        // Alert.alert('Recording saved', `Audio file saved at\n"${fileExternalFullPath.replace(RNFS.ExternalStorageDirectoryPath + '/', '')}".\n\nYou can now send the audio to be converted to text`);
      } catch (err) {
        console.error('Error while moving temp file:', err);
        Alert.alert('Error while moving file', err);
      }
    }

    this.setState({ 
      isRecording: false, 
      convertInBackend: this.requiresToConvertInBackend(this.state.format) 
    });

    // Load recorded audio into Player
    await this.loadPlayer();
  }

  requiresToConvertInBackend(format) {
    return format !== 'amr';
  }

  showConvertInServerAlert() {
    Alert.alert('Convert audio in server', 
    'All audio formats except .amr needs to be converted in the backend server to be acceptable to Google Speech-to-Text API.' +
    '\n\nThis app must be connected to the backend to upload the audio for conversion.',
    [{ text: `${this.state.connectedWithBackend ? 'Reconnect' : 'Connect'} with backend`, onPress: () => { this.connectWithBackend() } }, 
    { text: 'Ok' }]
    );
  }

  // https://stackoverflow.com/a/61335543/11138267
  secondsToTime(e){
    var h = Math.floor(e / 3600).toString().padStart(2,'0'),
        m = Math.floor(e % 3600 / 60).toString().padStart(2,'0'),
        s = Math.floor(e % 60).toString().padStart(2,'0');
    return h + ':' + m + ':' + s;
  }

  render() {
    return (
      <>
        <SafeAreaView style={styles.safeAreaView}>
          <ScrollView contentContainerStyle={styles.scrollView}>
            <View>


              <View style={styles.card}>
                <Text style={styles.heading}>Speech audio</Text>

                <Text style={{ fontSize: 20 }}>Source</Text>
                <View style={styles.sourceView}>
                  { this.isAndroid ? (
                    <View style={styles.sourceButtonContainer}>
                      <Icon.Button name='file-audio-o' backgroundColor={Color.S} style={styles.sourceButton} color='black' onPress={this.selectFile.bind(this)}
                        disabled={this.state.isRecording || this.state.recorderBusy} >
                        <Text style={styles.buttonText}>Select file</Text>
                      </Icon.Button>
                    </View>
                  ) : null }
                  <View style={styles.sourceButtonContainer}>
                    <Icon.Button name={this.state.isRecording ? 'stop' : 'microphone'} 
                      backgroundColor={this.state.isRecording || this.state.recorderBusy ? '#d9534f' : Color.S} 
                      color={this.state.isRecording ? 'white' : 'black'} 
                      onPress={this.toggleVoiceRecording.bind(this)} 
                      disabled={this.state.recorderBusy}>
                      <Text style={this.state.isRecording || this.state.recorderBusy ? styles.buttonTextRed : styles.buttonText}>
                        {this.state.isRecording ? 'Stop recording' : 'Record voice'}
                      </Text>
                    </Icon.Button>
                  </View>
                </View>

                { this.player ? (
                  <View style={[styles.sourceView, { paddingVertical: 10, borderRadius: 15, backgroundColor: this.state.playerBusy ? Color.P_DARK : 'transparent' }]}>
                    <Icon name={this.state.isPlaying ? 'pause' : 'play' } size={18} style={{ marginRight: 10 }} 
                      onPress={this.togglePlayer.bind(this)}/>
                    <Text>{this.secondsToTime(Math.floor(Math.max(this.state.playerCurrentTimeAprox, 0) / 1000))}</Text>
                    <Slider
                      style={{ minWidth: 200, flex: 0.8}}
                      minimumValue={0}
                      maximumValue={this.player.duration}
                      value={this.player.currentTime}
                      disabled={this.state.playerBusy}
                      onSlidingComplete={this.seekPlayer.bind(this)}
                    />
                  </View>
                ) : null}

                <Text style={styles.sectionTitle}>File metadata and options</Text>
                <View style={styles.optionsView}>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Name</Text>
                    <Text numberOfLines={2} style={{ flex: 2, fontSize: 14, textAlign: 'right' }}>{this.state.fileName}</Text>
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>URI / Path</Text>
                    <Text numberOfLines={3} style={{ flex: 2, fontSize: 12 }}>
                      {(this.state.fileFullPath || '').replace(RNFS.ExternalStorageDirectoryPath + '/', '')}
                    </Text>
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Format <Text style={{ fontSize: 12 }}>(See&nbsp;
                        <Text style={styles.link} onPress={() => Linking.openURL('https://cloud.google.com/speech-to-text/docs/reference/rest/v1p1beta1/RecognitionConfig#audioencoding')}>module</Text>,&nbsp;
                        <Text style={styles.link} onPress={() => Linking.openURL('https://github.com/react-native-community/react-native-audio-toolkit/blob/v2.0.3/docs/API.md#recorder-methods')}>API</Text>)
                      </Text>
                    </Text>
                    {/* google.cloud.speech.v1p1beta1.RecognitionConfig.AudioEncoding
                        https://cloud.google.com/speech-to-text/docs/encoding#audio-encodings */}
                    <Picker style={[styles.picker, { flex: 0, minWidth: 110 }]} 
                      onValueChange={format => { 
                        if (format !== this.state.format) this.resetAudioSource(format) 
                      } } 
                      selectedValue={this.state.format} mode={"dropdown"}>
                      {
                        this.getAvailableFormats().map(f => (
                          <Picker.Item value={f.value} label={f.label} key={f.value} />
                        ))
                      }
                    </Picker>
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Duration</Text>
                    { this.state.duration ? (
                      <Text numberOfLines={2} style={styles.textValue}>{`${Math.ceil(this.state.duration / 1000)}s (${this.state.duration}ms)`}</Text>
                    ) : null }
                  </View>
                </View>

              </View>


              <View style={styles.card}>
                <View style={{ alignSelf: 'flex-start' }}>
                  <Text style={[styles.heading, styles.link]} onPress={() => Linking.openURL('https://cloud.google.com/speech-to-text/docs/reference/rest/v1p1beta1/RecognitionConfig')} >
                    Options
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>Conversion</Text>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Backend status <Text style={{ fontSize: 12 }}>({ Consts.BACKEND_URL })</Text></Text>
                    <Icon name="refresh" size={18} style={{ marginRight: 10 }} onPress={this.connectWithBackend.bind(this)}/>
                    <Text style={[styles.label, { flex: 0, color: this.state.connectedWithBackend ? '#5cb85c' : '#d9534f' }]}>
                      {this.state.connectedWithBackend ? 'connected' : 'not connected' }
                    </Text>
                  </View>
                  <View style={styles.optionContainer}>
                    <Icon name="info-circle" size={18} style={{ marginRight: 10 }} onPress={this.showConvertInServerAlert.bind(this)}/>
                    <Text style={styles.label}>Convert in backend</Text>
                    <CheckBox style={styles.checkbox} disabled={true} value={this.state.convertInBackend}/>
                  </View>
                <View style={styles.optionsView}>
                </View>

                <Text style={styles.sectionTitle}>Recognition options</Text>
                <View style={styles.optionsView}>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Language</Text>
                    <Picker style={styles.picker} onValueChange={languageCode => this.setState({ languageCode })} selectedValue={this.state.languageCode} mode={"dialog"}>
                      {this.languagesPickerItems}
                    </Picker>
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Profanity filter</Text>
                    <Switch style={styles.switch} trackColor={Color.S_LIGHT} thumbColor={Color.S_DARK}
                      onValueChange={profanityFilter => this.setState({ profanityFilter })} value={this.state.profanityFilter} />
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Word time offset</Text>
                    <Switch style={styles.switch} trackColor={Color.S_LIGHT} thumbColor={Color.S_DARK}
                      onValueChange={wordTimeOffset => this.setState({ wordTimeOffset })} value={this.state.wordTimeOffset} />
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Word confidence</Text>
                    <Switch style={styles.switch} trackColor={Color.S_LIGHT} thumbColor={Color.S_DARK}
                      onValueChange={wordConfidence => this.setState({ wordConfidence })} value={this.state.wordConfidence} />
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Automatic punctuation</Text>
                    <Switch style={styles.switch} trackColor={Color.S_LIGHT} thumbColor={Color.S_DARK}
                      onValueChange={automaticPunctuation => this.setState({ automaticPunctuation })} value={this.state.automaticPunctuation} />
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Model</Text>
                    <Picker style={styles.picker} onValueChange={model => this.setState = ({ model })} selectedValue={this.state.model} mode={"dropdown"}>
                      <Picker.Item label="Default" value="default" />
                      <Picker.Item label="Command and search" value="command_and_search" />
                      <Picker.Item label="Phone call" value="phone_call" />
                      <Picker.Item label="Video" value="video" />
                    </Picker>
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Enhanced model</Text>
                    <Switch style={styles.switch} trackColor={Color.S_LIGHT} thumbColor={Color.S_DARK}
                      onValueChange={enhancedModel => this.setState({ enhancedModel })} value={this.state.enhancedModel} />
                  </View>
                </View>

                {/* <Text style={styles.sectionTitle}>Recognition metadata</Text>
                <View style={styles.optionsView}>
                </View> */}

                <Icon.Button name='cloud-upload' backgroundColor={this.canSendAudio() ? Color.S : 'lightgrey'} style={styles.sourceButton} color='black' 
                  onPress={this.doSpeechToText.bind(this)} disabled={!this.canSendAudio()}>
                  <Text style={styles.buttonText}>Recognize speech</Text>
                </Icon.Button>
              </View>

              <View style={[styles.card, { marginBottom: 0, flex: 1 }]}>
                <Text style={styles.heading}>Response</Text>

                { this.state.isRecognizing ? (
                  <View style={styles.optionContainer}>
                    <ActivityIndicator style={{ marginRight: 5 }} size="small" color={Color.S_DARK} />
                    <Text style={styles.label}>{this.state.recognitionAIText}</Text>
                  </View>
                ) : null}
                
                <Text style={styles.sectionTitle}>Transcript</Text>
                <ScrollView style={styles.resultView} nestedScrollEnabled={true}>
                  <Text style={styles.textarea} numberOfLines={1000}>{this.state.transcriptText}</Text>
                </ScrollView>

                <Text style={styles.sectionTitle}>Body</Text>
                <ScrollView style={styles.resultView} nestedScrollEnabled={true}>
                  <Text style={styles.textarea} numberOfLines={1000}>{this.state.responseBodyText}</Text>
                </ScrollView>
              </View>


            </View>
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }
};

const styles = StyleSheet.create({
  safeAreaView: {
    backgroundColor: Color.P_DARK,
    flex: 1,
  },
  scrollView: {
    padding: 10,
  },
  card: {
    borderRadius: 15,
    paddingVertical: 10,
    paddingBottom: 15,
    paddingHorizontal: 15,
    backgroundColor: Color.P,
    marginBottom: 10,
  },
  heading: {
    fontWeight: 'normal',
    fontSize: 30,
  },

  sourceView: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceButtonContainer: {
    flex: 1,
    margin: 5,
  },
  buttonText: {
    color: 'black',
    fontSize: 18
  },
  buttonTextRed: {
    color: 'white',
    fontSize: 18
  },
  input: {
    flex: 1.3,
    backgroundColor: Color.S,
    color: 'black',
    maxHeight: 24,
    borderRadius: 5,
    paddingVertical: 0,
    textAlign: 'right'
  },
  textValue: {
    fontSize: 16
  },

  optionsView: {
    flex: 1,
  },
  optionContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  switch: {
  },
  picker: {
    flex: 1.3,
    maxHeight: 24,
    alignItems: 'flex-end',
  },
  checkbox: {
    maxHeight: 22,
    marginRight: 7,
  },
  labelIcon: {
    paddingTop: 2,
    fontSize: 15,
    color: 'darkgrey',
    marginRight: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  label: {
    flex: 1,
    fontSize: 18
  },
  link: {
    color: '#33b5e5',
    textDecorationLine: 'underline',
  },

  resultView: {
    padding: 10,
    maxHeight: 300,
    borderColor: Color.S_DARK,
    borderRadius: 5,
    borderWidth: 3,
  },
  textarea: {
  }
});
