import * as React from 'react'
import {
  Dimensions,
  Animated,
  PanResponder,
  PanResponderInstance,
  StyleSheet,
  ViewStyle,
  View,
  Platform,
} from 'react-native'

const SWIPE_THRESHOLD = 0.15 * Dimensions.get('window').width
const SWIPE_OUT_DURATION = 250
const FLIP_THRESHOLD = 0.15 * Dimensions.get('window').width
const COMPLETE_FLIP_DURATION = 250

export type Direction = 'LEFT' | 'RIGHT'

export interface RenderCurrentCardFrontParams {
  currentCardPosition: Animated.ValueXY
  currentCardYRotation: Animated.Value
}

interface DeckProps {
  /**
   * A value that uniquely identifies the current card.
   */
  cardId: string

  renderCurrentCardFront: (
    params: RenderCurrentCardFrontParams,
  ) => React.ReactElement<any>

  /**
   * Providing this prop will autmatically enable card flipping.
   */
  renderCurrentCardBack?: () => React.ReactElement<any>

  /**
   * This should look exactly as the result of calling renderCurrentCardFront for
   * the next card.
   */
  renderNextCardFrontPlaceholder?: () => React.ReactElement<any>

  /**
   * This is to hide the next card when the user flips the current card.
   */
  renderNextCardOverlay?: () => React.ReactElement<any>

  onCompletedSwipe?: (direction: Direction) => void

  style?: ViewStyle
  cardContainerStyle?: ViewStyle
  cardShadowStyle?: ViewStyle
  currentCardElevation?: number
  nextCardElevation?: number

  nonSwipeawayable?: boolean
  nonFlippable?: boolean

  renderLeftResult?: () => React.ReactElement<any> | null
  renderRightResult?: () => React.ReactElement<any> | null
}
interface DeckState {
  isFlipping: boolean
  activeAnimation: 'FLIPPING' | 'SWIPING'
}

export class Deck extends React.Component<DeckProps, DeckState> {
  private currentCardPosition: Animated.ValueXY = new Animated.ValueXY()
  private currentCardYRotation: Animated.Value = new Animated.Value(0)
  private currentCardPanResponder: PanResponderInstance

  constructor(props: DeckProps) {
    super(props)

    this.state = {
      isFlipping: false,
      activeAnimation: this.props.renderCurrentCardBack
        ? 'FLIPPING'
        : 'SWIPING',
    }

    this.currentCardPanResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Don't take over if the user is scrolling vertically
        if (Math.abs(gestureState.dy) > Math.abs(gestureState.dx)) return false
        // Only take over after the user has moved finger a little bit so that
        // we don't capture single touches
        return Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2) > 10
      },
      onPanResponderGrant: () => {
        this.setState(currentState => {
          if (currentState.activeAnimation === 'FLIPPING') {
            return { isFlipping: true }
          }
          return { isFlipping: false }
        })
      },
      onPanResponderMove: (_, gesture) => {
        if (this.state.activeAnimation === 'FLIPPING') {
          this.currentCardYRotation.setValue(gesture.dx)
        } else {
          this.currentCardPosition.setValue({ x: gesture.dx, y: gesture.dy })
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (this.state.activeAnimation === 'FLIPPING') {
          if (gesture.dx > FLIP_THRESHOLD && !this.props.nonFlippable) {
            this.forceFlip('RIGHT')
          } else if (gesture.dx < -FLIP_THRESHOLD && !this.props.nonFlippable) {
            this.forceFlip('LEFT')
          } else {
            this.resetRotation()
          }
        } else {
          if (gesture.dx > SWIPE_THRESHOLD && !this.props.nonSwipeawayable) {
            this.forceSwipe('RIGHT')
          } else if (
            gesture.dx < -SWIPE_THRESHOLD &&
            !this.props.nonSwipeawayable
          ) {
            this.forceSwipe('LEFT')
          } else {
            this.resetPosition()
          }
        }
      },
      onShouldBlockNativeResponder: () => true,
    })
  }

  componentWillReceiveProps(newProps: DeckProps) {
    if (this.props.cardId !== newProps.cardId) {
      this.setState({
        activeAnimation: newProps.renderCurrentCardBack
          ? 'FLIPPING'
          : 'SWIPING',
      })
    }

    this.resetPosition()
  }

  forceSwipe(direction: Direction, duration = SWIPE_OUT_DURATION) {
    const x =
      direction === 'RIGHT'
        ? Dimensions.get('window').width * 1.5
        : -Dimensions.get('window').width * 1.5

    Animated.timing(this.currentCardPosition, {
      toValue: { x, y: 0 },
      duration,
    }).start(() => this.onSwipeComplete(direction))
  }

  forceFlip(direction: Direction, duration = COMPLETE_FLIP_DURATION) {
    const rotateY =
      direction === 'LEFT'
        ? -Dimensions.get('window').width
        : Dimensions.get('window').width

    Animated.timing(this.currentCardYRotation, {
      toValue: rotateY,
      duration,
    }).start(this.onFlipComplete)
  }

  onSwipeComplete = (direction: Direction) => {
    // Reset without animating
    this.currentCardPosition.setValue({ x: 0, y: 0 })
    this.currentCardYRotation.setValue(0)

    if (this.props.onCompletedSwipe) {
      this.props.onCompletedSwipe(direction)
    }
  }

  onFlipComplete = () => {
    this.setState({
      activeAnimation: 'SWIPING',
      isFlipping: false,
    })
  }

  resetPosition() {
    Animated.spring(this.currentCardPosition, {
      toValue: { x: 0, y: 0 },
    }).start()
  }

  resetRotation() {
    Animated.spring(this.currentCardYRotation, {
      toValue: 0,
    }).start(() => this.setState({ isFlipping: false }))
  }

  renderNextCard = () => {
    if (!this.props.renderNextCardFrontPlaceholder) {
      return null
    }

    const nextCard = this.props.renderNextCardFrontPlaceholder()
    if (!nextCard) {
      return null
    }

    const SCREEN_WIDTH = Dimensions.get('window').width

    const nextCardScale = this.currentCardPosition.x.interpolate({
      inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      outputRange: [1, 0.95, 1],
      extrapolate: 'clamp',
    })

    const nextCardOpacity = this.currentCardPosition.x.interpolate({
      inputRange: [
        -SCREEN_WIDTH,
        -SCREEN_WIDTH / 2,
        0,
        SCREEN_WIDTH / 2,
        SCREEN_WIDTH,
      ],
      outputRange: [0, 0.8, 1.0, 0.8, 0],
      extrapolate: 'clamp',
    })

    const nextCardElevation =
      this.props.nextCardElevation && !this.state.isFlipping
        ? this.props.nextCardElevation
        : 0

    return (
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          zIndex: 0,
          transform: [{ scale: nextCardScale }],
          elevation: nextCardElevation,
        }}
      >
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            ...this.props.cardShadowStyle,
            elevation: nextCardElevation,
          }}
        >
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              overflow: 'hidden',
              elevation: nextCardElevation,
              ...this.props.cardContainerStyle,
            }}
          >
            {nextCard}
            {this.props.renderNextCardOverlay && (
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  opacity: nextCardOpacity,
                }}
              >
                {this.props.renderNextCardOverlay()}
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    )
  }

  renderCurrentCard = () => {
    const currentCard = this.props.renderCurrentCardFront({
      currentCardPosition: this.currentCardPosition,
      currentCardYRotation: this.currentCardYRotation,
    })

    const SCREEN_WIDTH = Dimensions.get('window').width

    const currentCardRotation = this.currentCardPosition.x.interpolate({
      inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
      outputRange: ['20deg', '0deg', '-20deg'],
    })

    const currentCardFrontYRotation = this.currentCardYRotation.interpolate({
      inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      outputRange: this.props.nonFlippable
        ? ['-90deg', '0deg', '90deg']
        : ['-180deg', '0deg', '180deg'],
      extrapolate: 'clamp',
    })

    const currentCardBackYRotation = this.currentCardYRotation.interpolate({
      inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      outputRange: this.props.nonFlippable
        ? ['-270deg', '-180deg', '-90deg']
        : ['-360deg', '-180deg', '0deg'],
      extrapolate: 'clamp',
    })

    const currentCardElevation =
      this.props.currentCardElevation && !this.state.isFlipping
        ? this.props.currentCardElevation
        : 0

    // Hiding the overflow on Android causes buggy clipping when rotating
    // https://github.com/facebook/react-native/issues/18266
    const overflow = Platform.OS === 'ios' ? 'hidden' : null

    return (
      <Animated.View
        style={[
          {
            ...StyleSheet.absoluteFillObject,
            zIndex: 500,
            transform: [
              ...this.currentCardPosition.getTranslateTransform(),
              { rotate: currentCardRotation },
            ],
            elevation: currentCardElevation,
          },
        ]}
        {...this.currentCardPanResponder.panHandlers}
      >
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            ...this.props.cardShadowStyle,
            transform: [
              { perspective: 1000 },
              { rotateY: currentCardFrontYRotation },
            ],
            elevation: currentCardElevation,
            backfaceVisibility: 'hidden',
          }}
        >
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              overflow,
              elevation: currentCardElevation,
              ...this.props.cardContainerStyle,
            }}
          >
            {currentCard}
            {!this.props.renderCurrentCardBack && this.renderResults()}
          </View>
        </Animated.View>
        {this.props.renderCurrentCardBack && (
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              ...this.props.cardShadowStyle,
              transform: [
                { perspective: 1000 },
                { rotateY: currentCardBackYRotation },
              ],
              elevation: currentCardElevation,
              backfaceVisibility: 'hidden',
            }}
          >
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                overflow,
                elevation: currentCardElevation,
                ...this.props.cardContainerStyle,
              }}
            >
              {this.props.renderCurrentCardBack()}
              {this.renderResults()}
            </View>
          </Animated.View>
        )}
      </Animated.View>
    )
  }

  renderResults = () => {
    const overlayLeftOpacity = this.currentCardPosition.x.interpolate({
      inputRange: [0, Dimensions.get('window').width / 4],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    })

    const overlayRightOpacity = this.currentCardPosition.x.interpolate({
      inputRange: [-Dimensions.get('window').width / 4, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    })

    return (
      <>
        {this.props.renderLeftResult && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              opacity: overlayLeftOpacity,
            }}
          >
            {this.props.renderLeftResult()}
          </Animated.View>
        )}
        {this.props.renderRightResult && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              opacity: overlayRightOpacity,
            }}
          >
            {this.props.renderRightResult()}
          </Animated.View>
        )}
      </>
    )
  }

  render() {
    return (
      <View style={[styles.container, this.props.style]}>
        {this.renderNextCard()}
        {this.renderCurrentCard()}
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
