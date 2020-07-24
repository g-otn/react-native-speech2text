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
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { Picker } from '@react-native-community/picker';

import { google } from '@google-cloud/speech/build/protos/protos';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import DocumentPicker from 'react-native-document-picker';

export default class App extends Component {

  recorder;
  languagesPickerItems = require('./data/languages.json').map(l => (<Picker.Item key={l.bcp47} label={l.name} value={l.bcp47} />));

  constructor(props) {
    super(props);

    this.state = {
      // Metadata
      encoding: google.cloud.speech.v1p1beta1.RecognitionConfig.AudioEncoding.MP3,
      bitrate: 256000,
      sampleRateHertz: 44100,
      

      // Main Options
      languageCode: 'pt-BR',
      profanityFilter: true,
      wordTimeOffset: false,
      wordConfidence: false,
      automaticPunctuation: false,
      model: 'default',
      enhancedModel: false,
    }
  }

  async requestReadStoragePermission() {
    if (Platform.OS !== "android") return RESULTS.UNAVAILABLE;
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

  async selectFile() {
    // Request permission
    const permission = await this.requestReadStoragePermission();
    if (permission !== RESULTS.GRANTED) {
      return;
    }

    // Select file
    let fileMetadata = {};
    try {
      fileMetadata = await DocumentPicker.pick({
        // type: [DocumentPicker.types.audio],
        type: ['audio/AMR', 'audio/*'],
      });
    } catch (err) {
      console.error(err)
      return;
    }

    this.setState({ encoding: 'AMR' })
    Alert.alert('File', JSON.stringify(fileMetadata, null, '\t\t'))
  }

  async toggleVoiceRecording() {

  }

  async recordVoice() {
    // Request permission
    const permission = await this.requestMicrophonePermission();
    console.log(permission)
    if (permission !== RESULTS.GRANTED) {
      return;
    }

    // Start recording

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
                  { Platform.OS === 'android' ?
                    <View style={styles.sourceButtonContainer}>
                      <Icon.Button name='file-audio-o' backgroundColor='#e5ffff' style={styles.sourceButton} color='black' onPress={this.selectFile.bind(this)}>
                        <Text style={styles.buttonText}>Select file</Text>
                      </Icon.Button>
                    </View>
                    : null }
                  <View style={styles.sourceButtonContainer}>
                    <Icon.Button name='microphone' backgroundColor='#e5ffff' color='black' onPress={this.recordVoice.bind(this)}>
                      <Text style={styles.buttonText}>Record voice</Text>
                    </Icon.Button>
                  </View>
                </View>

                <View style={styles.sourceView}>

                </View>

                <Text style={styles.sectionTitle}>File metadata</Text>
                <View style={styles.optionsView}>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label} onPress={() => Linking.openURL('https://cloud.google.com/speech-to-text/docs/encoding#audio-encodings')}>
                      Encoding&nbsp;<Icon style={{ fontSize: 16 }} name="external-link" />
                    </Text>
                    {/* google.cloud.speech.v1p1beta1.RecognitionConfig.AudioEncoding
                        https://cloud.google.com/speech-to-text/docs/encoding#audio-encodings */}
                    <Picker style={styles.picker} onValueChange={encoding => this.setState({ encoding })} selectedValue={this.state.encoding} mode={"dropdown"}>
                      <Picker.Item value="MP3" label="MPEG Audio Layer III (MP3)" />
                      <Picker.Item value="FLAC" label="Free Lossless Audio Codec (FLAC)" />
                      <Picker.Item value="LINEAR16" label="Linear PCM (16-bit)" />
                      <Picker.Item value="MULAW" label="μ-law (8-bit PCM encoding)" />
                      <Picker.Item value="AMR" label="Adaptive Multi-Rate Narrowband (AMR)" />
                      <Picker.Item value="AMR_WB" label="Adaptive Multi-Rate Wideband (AMR-WB)" />
                      <Picker.Item value="OGG_OPUS" label="Opus encoded audio frames in an Ogg container" />
                      <Picker.Item value="SPEEX_WITH_HEADER_BYTE" label="Speex wideband" />
                      <Picker.Item value="ENCODING_UNSPECIFIED" label="Not specified." />
                    </Picker>
                  </View>
                  {/* <View style={styles.optionContainer}>
                    <Text style={styles.label}>Sample rate</Text>
                    <Text style={styles.textValue}></Text>
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Bitrate</Text>
                    <Text style={styles.textValue}></Text>
                  </View> */}
                </View>

              </View>


              <View style={styles.card}>
                <View style={{ alignSelf: 'flex-start' }}>
                  <Text style={styles.heading} onPress={() => Linking.openURL('https://cloud.google.com/speech-to-text/docs/reference/rest/v1p1beta1/RecognitionConfig')} >
                    Options&nbsp;<Icon style={{ fontSize: 20 }} name="external-link" />
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>Main options</Text>
                <View style={styles.optionsView}>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Language</Text>
                    <Picker style={styles.picker} onValueChange={languageCode => this.setState({ languageCode })} selectedValue={this.state.languageCode} mode={"dialog"}>
                      {this.languagesPickerItems}
                    </Picker>
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Profanity filter</Text>
                    <Switch style={styles.switch} onValueChange={profanityFilter => this.setState({ profanityFilter })} value={this.state.profanityFilter} />
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Word time offset</Text>
                    <Switch style={styles.switch} onValueChange={wordTimeOffset => this.setState({ wordTimeOffset })} value={this.state.wordTimeOffset} />
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Word confidence</Text>
                    <Switch style={styles.switch} onValueChange={wordConfidence => this.setState({ wordConfidence })} value={this.state.wordConfidence} />
                  </View>
                  <View style={styles.optionContainer}>
                    <Text style={styles.label}>Automatic punctuation</Text>
                    <Switch style={styles.switch} onValueChange={automaticPunctuation => this.setState({ automaticPunctuation })} value={this.state.automaticPunctuation} />
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
                    <Switch style={styles.switch} onValueChange={enhancedModel => this.setState({ enhancedModel })} value={this.state.enhancedModel} />
                  </View>
                </View>

                {/* <Text style={styles.sectionTitle}>Recognition metadata</Text>
                <View style={styles.optionsView}>
                </View> */}

                <Icon.Button name='cloud-upload' backgroundColor='#e5ffff' style={styles.sourceButton} color='black' onPress={() => { }} disabled={true}>
                  <Text style={styles.buttonText}>Send audio</Text>
                </Icon.Button>
              </View>

              <View style={[styles.card, { marginBottom: 20 }]}>
                <Text style={styles.heading}>Response</Text>

                <Text style={styles.sectionTitle}>Transcript</Text>
                <ScrollView style={styles.resultView}>
                  <Text style={styles.textarea} numberOfLines={1000}>{}</Text>
                </ScrollView>

                <Text style={styles.sectionTitle}>Body</Text>
                <ScrollView style={styles.resultView}>
                  <Text style={styles.textarea} numberOfLines={1000}>{}</Text>
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
    backgroundColor: '#82ada9',
    flex: 1,
  },
  scrollView: {
    padding: 10,
  },
  card: {
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#b2dfdb',
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
  input: {
    flex: 1.3,
    backgroundColor: '#e5ffff',
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
    width: '50%'
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

  resultView: {
    padding: 10,
    maxHeight: 300,
    borderColor: '#82ada9',
    borderRadius: 5,
    borderWidth: 3,
  },
  textarea: {
  }
});