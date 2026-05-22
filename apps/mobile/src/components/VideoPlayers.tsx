import { Image, type ImageStyle, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type LiveVideoProps = {
  uri: string | null;
  posterUri?: string | null;
  videoStyle: StyleProp<ViewStyle>;
  emptyStyle: StyleProp<ViewStyle>;
  posterStyle: StyleProp<ImageStyle>;
  emptyTitleStyle: StyleProp<TextStyle>;
  emptyTextStyle: StyleProp<TextStyle>;
};

export function LiveVideo({ uri, posterUri, videoStyle, emptyStyle, posterStyle, emptyTitleStyle, emptyTextStyle }: LiveVideoProps) {
  const player = useVideoPlayer(uri ? { uri } : null, (instance) => {
    instance.loop = true;
    if (uri) instance.play();
  });

  if (!uri) {
    return (
      <View style={[videoStyle, emptyStyle]}>
        {posterUri ? <Image source={{ uri: posterUri }} style={posterStyle} /> : null}
        <Text style={emptyTitleStyle}>Stream indisponivel</Text>
        <Text style={emptyTextStyle}>Atualize ou abra a câmera novamente.</Text>
      </View>
    );
  }

  return <VideoView player={player} style={videoStyle} nativeControls contentFit="contain" />;
}

export function PlaybackVideo({ uri, style }: { uri: string; style: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}
